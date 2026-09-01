import { FastifyInstance } from 'fastify';
import PDFDocument from 'pdfkit';
import { query } from '../database/db.js';
import { authenticate, AuthedRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/auditLog.js';
import { config } from '../config.js';
import { format, parseISO } from 'date-fns';

/** Gather all data needed to render a daily PDF report. */
async function getDailyReportData(date: string) {
  const [total, byType, byPayment, byDept, byEvent, recent] = await Promise.all([
    // Total count
    query(
      `SELECT COUNT(*) as total,
        SUM(CASE WHEN registration_type = 200 THEN 1 ELSE 0 END) as type200,
        SUM(CASE WHEN registration_type = 250 THEN 1 ELSE 0 END) as type250
       FROM registrations WHERE registration_date = $1`,
      [date]
    ),
    // Revenue by type
    query(
      `SELECT registration_type, COUNT(*) as count
       FROM registrations WHERE registration_date = $1
       GROUP BY registration_type`,
      [date]
    ),
    // Payment method breakdown
    query(
      `SELECT payment_method, COUNT(*) as count,
        SUM(CASE WHEN registration_type = 200 THEN 200 ELSE 250 END) as est_revenue
       FROM registrations WHERE registration_date = $1
       GROUP BY payment_method ORDER BY count DESC`,
      [date]
    ),
    // Department breakdown
    query(
      `SELECT department, COUNT(*) as count
       FROM registrations WHERE registration_date = $1
       GROUP BY department ORDER BY count DESC`,
      [date]
    ),
    // Event popularity
    query(
      `SELECT event_name, COUNT(*) as count FROM (
         SELECT event_1 as event_name FROM registrations WHERE registration_date = $1 AND event_1 IS NOT NULL AND event_1 != ''
         UNION ALL
         SELECT event_2 FROM registrations WHERE registration_date = $1 AND event_2 IS NOT NULL AND event_2 != ''
         UNION ALL
         SELECT event_3 FROM registrations WHERE registration_date = $1 AND event_3 IS NOT NULL AND event_3 != ''
       ) e GROUP BY event_name ORDER BY count DESC`,
      [date]
    ),
    // Last registrations of the day
    query(
      `SELECT registrant_name, reg_no, department, year, registration_type, event_1, event_2, event_3, payment_method
       FROM registrations WHERE registration_date = $1
       ORDER BY synced_at DESC LIMIT 15`,
      [date]
    ),
  ]);

  const t = total.rows[0];
  const totalCount = parseInt(t?.total || '0', 10);
  const type200 = parseInt(t?.type200 || '0', 10);
  const type250 = parseInt(t?.type250 || '0', 10);
  const revenue = type200 * 200 + type250 * 250;

  return { date, totalCount, type200, type250, revenue, byType, byPayment, byDept, byEvent, recent };
}

// ─── PDF Renderer ──────────────────────────────────────────────────────────

function drawDailyPdf(data: Awaited<ReturnType<typeof getDailyReportData>>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 36, bottom: 0, left: 36, right: 36 },
      autoFirstPage: true,
      bufferPages: true,
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    // Design Tokens
    const GOLD = '#D4A843';
    const DARK = '#10141D';
    const GRAY_BG = '#F8FAFC';
    const BORDER_COLOR = '#E2E8F0';
    const TEXT_PRIMARY = '#0F172A';
    const TEXT_MUTED = '#64748B';
    const MARGIN = 36;
    const USABLE_W = doc.page.width - MARGIN * 2; // 523pt

    // Safe date display
    let formattedDate = data.date;
    try {
      formattedDate = format(parseISO(data.date), 'dd MMMM yyyy');
    } catch {}

    // ── 1. Top Header Banner ────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 76).fill(DARK);

    doc.fillColor(GOLD).fontSize(18).font('Helvetica-Bold')
      .text('FAC PYROS — REGISTRATION REPORT', MARGIN, 18, { width: USABLE_W - 140 });

    doc.fillColor('#94A3B8').fontSize(9).font('Helvetica')
      .text("That's How We Rock It!  •  Official Executive Daily Summary", MARGIN, 42, { width: USABLE_W - 140 });

    // Date Pill on Top-Right
    const datePillW = 135;
    const datePillX = doc.page.width - MARGIN - datePillW;
    doc.roundedRect(datePillX, 20, datePillW, 36, 4).fillAndStroke('#1E293B', GOLD);
    doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
      .text('REPORT DATE', datePillX, 26, { width: datePillW, align: 'center' });
    doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
      .text(formattedDate, datePillX, 38, { width: datePillW, align: 'center' });

    // ── 2. KPI Metrics Row (y = 90) ─────────────────────────────────────────
    const kpiY = 90;
    const kpiH = 50;
    const kpiGap = 8;
    const kpiW = (USABLE_W - kpiGap * 3) / 4;

    const kpiList = [
      { label: 'Total Registrations', value: String(data.totalCount), color: GOLD },
      { label: 'Rs. 200 Tier', value: String(data.type200), color: '#3B82F6' },
      { label: 'Rs. 250 Tier', value: String(data.type250), color: '#8B1A1A' },
      { label: 'Gross Revenue', value: `Rs. ${data.revenue.toLocaleString('en-IN')}`, color: '#10B981' },
    ];

    kpiList.forEach((kpi, i) => {
      const x = MARGIN + i * (kpiW + kpiGap);
      doc.roundedRect(x, kpiY, kpiW, kpiH, 4).fillAndStroke(GRAY_BG, BORDER_COLOR);

      doc.fillColor(kpi.color).fontSize(16).font('Helvetica-Bold')
        .text(kpi.value, x + 6, kpiY + 8, { width: kpiW - 12, align: 'center' });

      doc.fillColor(TEXT_MUTED).fontSize(7.5).font('Helvetica-Bold')
        .text(kpi.label.toUpperCase(), x + 6, kpiY + 30, { width: kpiW - 12, align: 'center' });
    });

    // ── 3. Middle 2-Column Section (y = 152) ────────────────────────────────
    const midY = 152;
    const midH = 148;
    const colGap = 12;
    const colW = (USABLE_W - colGap) / 2; // ~255pt each
    const col1X = MARGIN;
    const col2X = MARGIN + colW + colGap;

    // Helper: Draw Section Header Bar
    const drawHeader = (title: string, x: number, y: number, w: number) => {
      doc.roundedRect(x, y, w, 18, 2).fill(DARK);
      doc.fillColor(GOLD).fontSize(8.5).font('Helvetica-Bold')
        .text(title.toUpperCase(), x + 8, y + 5, { width: w - 16 });
    };

    // ── Column 1: Payment Methods & Departments ──
    drawHeader('Payment Methods Breakdown', col1X, midY, colW);

    let curY = midY + 22;
    const payRows = data.byPayment.rows.slice(0, 4);

    // Mini Table Header
    doc.rect(col1X, curY, colW, 14).fill('#E2E8F0');
    doc.fillColor(TEXT_PRIMARY).fontSize(7.5).font('Helvetica-Bold')
      .text('Method', col1X + 6, curY + 3, { width: 100 })
      .text('Count', col1X + 110, curY + 3, { width: 45, align: 'center' })
      .text('Est. Revenue', col1X + 160, curY + 3, { width: colW - 166, align: 'right' });
    curY += 14;

    payRows.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? '#FFFFFF' : GRAY_BG;
      doc.rect(col1X, curY, colW, 14).fillAndStroke(bg, BORDER_COLOR);
      const estRev = parseInt(r.est_revenue || '0', 10) || (parseInt(r.count, 10) * 250);
      doc.fillColor(TEXT_PRIMARY).fontSize(7.5).font('Helvetica')
        .text(r.payment_method || 'Unknown', col1X + 6, curY + 3, { width: 100 })
        .text(String(r.count), col1X + 110, curY + 3, { width: 45, align: 'center' })
        .text(`Rs. ${estRev.toLocaleString('en-IN')}`, col1X + 160, curY + 3, { width: colW - 166, align: 'right' });
      curY += 14;
    });

    // Department Breakdown
    curY += 8;
    drawHeader('Department Breakdown', col1X, curY, colW);
    curY += 22;

    doc.rect(col1X, curY, colW, 14).fill('#E2E8F0');
    doc.fillColor(TEXT_PRIMARY).fontSize(7.5).font('Helvetica-Bold')
      .text('Department', col1X + 6, curY + 3, { width: 170 })
      .text('Registrations', col1X + 180, curY + 3, { width: colW - 186, align: 'right' });
    curY += 14;

    const deptRows = data.byDept.rows.slice(0, 4);
    deptRows.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? '#FFFFFF' : GRAY_BG;
      doc.rect(col1X, curY, colW, 14).fillAndStroke(bg, BORDER_COLOR);
      doc.fillColor(TEXT_PRIMARY).fontSize(7.5).font('Helvetica')
        .text(r.department || 'Unknown', col1X + 6, curY + 3, { width: 170 })
        .text(String(r.count), col1X + 180, curY + 3, { width: colW - 186, align: 'right' });
      curY += 14;
    });

    // ── Column 2: Event Popularity Leaderboard ──
    drawHeader('Event Participation Leaderboard', col2X, midY, colW);

    let eventY = midY + 22;
    doc.rect(col2X, eventY, colW, 14).fill('#E2E8F0');
    doc.fillColor(TEXT_PRIMARY).fontSize(7.5).font('Helvetica-Bold')
      .text('#', col2X + 6, eventY + 3, { width: 15 })
      .text('Event Name', col2X + 24, eventY + 3, { width: 160 })
      .text('Participants', col2X + 185, eventY + 3, { width: colW - 192, align: 'right' });
    eventY += 14;

    const eventRows = data.byEvent.rows.slice(0, 8);
    eventRows.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? '#FFFFFF' : GRAY_BG;
      doc.rect(col2X, eventY, colW, 14).fillAndStroke(bg, BORDER_COLOR);

      doc.fillColor(idx < 3 ? GOLD : TEXT_MUTED).fontSize(7.5).font('Helvetica-Bold')
        .text(String(idx + 1), col2X + 6, eventY + 3, { width: 15 });

      doc.fillColor(TEXT_PRIMARY).fontSize(7.5).font('Helvetica')
        .text(r.event_name, col2X + 24, eventY + 3, { width: 160, lineBreak: false });

      doc.fillColor(TEXT_PRIMARY).fontSize(7.5).font('Helvetica-Bold')
        .text(String(r.count), col2X + 185, eventY + 3, { width: colW - 192, align: 'right' });
      eventY += 14;
    });

    // ── 4. Bottom Table: Latest Registrations Roster (y = 316) ───────────────
    let tableY = Math.max(curY, eventY) + 12;
    drawHeader(`Latest Registrations Roster (Showing ${data.recent.rows.length} records)`, MARGIN, tableY, USABLE_W);
    tableY += 22;

    // Table Columns: Name (110), RegNo (75), Dept (70), Tier (45), Pay (45), Events (178) = 523
    const colDefs = [
      { key: 'name', label: 'STUDENT NAME', width: 110, align: 'left' },
      { key: 'regNo', label: 'REG NO', width: 75, align: 'left' },
      { key: 'dept', label: 'DEPT', width: 70, align: 'left' },
      { key: 'tier', label: 'TIER', width: 45, align: 'center' },
      { key: 'pay', label: 'PAY', width: 45, align: 'center' },
      { key: 'events', label: 'REGISTERED EVENTS', width: 178, align: 'left' },
    ];

    // Draw Table Header
    doc.rect(MARGIN, tableY, USABLE_W, 15).fill('#E2E8F0');
    let hx = MARGIN;
    colDefs.forEach((col) => {
      doc.fillColor(TEXT_PRIMARY).fontSize(7).font('Helvetica-Bold')
        .text(col.label, hx + 4, tableY + 4, { width: col.width - 8, align: col.align as any });
      hx += col.width;
    });
    tableY += 15;

    // Draw Data Rows
    data.recent.rows.forEach((r, idx) => {
      const eventsStr = [r.event_1, r.event_2, r.event_3].filter(Boolean).join(', ') || '—';
      doc.fontSize(6.8);
      const eventsH = doc.heightOfString(eventsStr, { width: 170 });
      const rowHeight = Math.max(15, eventsH + 4);

      const bg = idx % 2 === 0 ? '#FFFFFF' : GRAY_BG;
      doc.rect(MARGIN, tableY, USABLE_W, rowHeight).fillAndStroke(bg, BORDER_COLOR);

      let rx = MARGIN;

      // 1. Name
      doc.fillColor(TEXT_PRIMARY).fontSize(7.2).font('Helvetica-Bold')
        .text(r.registrant_name || '—', rx + 4, tableY + 3, { width: 102, lineBreak: false });
      rx += 110;

      // 2. Reg No
      doc.fillColor(TEXT_MUTED).fontSize(6.8).font('Helvetica')
        .text(r.reg_no || '—', rx + 4, tableY + 3, { width: 67, lineBreak: false });
      rx += 75;

      // 3. Dept
      doc.fillColor(TEXT_PRIMARY).fontSize(6.8).font('Helvetica')
        .text(r.department || '—', rx + 4, tableY + 3, { width: 62, lineBreak: false });
      rx += 70;

      // 4. Tier
      doc.fillColor(r.registration_type === 200 ? '#3B82F6' : '#8B1A1A').fontSize(7.2).font('Helvetica-Bold')
        .text(`Rs. ${r.registration_type}`, rx + 2, tableY + 3, { width: 41, align: 'center' });
      rx += 45;

      // 5. Payment
      doc.fillColor(TEXT_MUTED).fontSize(6.8).font('Helvetica')
        .text(r.payment_method || 'CASH', rx + 2, tableY + 3, { width: 41, align: 'center' });
      rx += 45;

      // 6. Events
      doc.fillColor(TEXT_PRIMARY).fontSize(6.8).font('Helvetica')
        .text(eventsStr, rx + 4, tableY + 2.5, { width: 170 });

      tableY += rowHeight;
    });

    // ── 5. Fixed Pinned Footer ───────────────────────────────────────────────
    const footerY = doc.page.height - 30;
    doc.rect(0, footerY - 4, doc.page.width, 34).fill(DARK);
    doc.fillColor(GOLD).fontSize(7.5).font('Helvetica-Bold')
      .text('FAC PYROS 2026', MARGIN, footerY + 6, { width: 150, lineBreak: false });
    doc.fillColor('#94A3B8').fontSize(7).font('Helvetica')
      .text(`Generated on ${format(new Date(), 'dd MMM yyyy HH:mm')} IST  •  Registration Analytics Dashboard`, MARGIN + 150, footerY + 6, { width: USABLE_W - 150, align: 'right', lineBreak: false });

    doc.end();
  });
}

// ─── Routes ────────────────────────────────────────────────────────────────

export async function pdfRoutes(app: FastifyInstance) {
  // GET /api/reports/daily/:date — PDF download for a specific date
  app.get(
    '/api/reports/daily/:date',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { date } = request.params as { date: string };
      const user = (request as AuthedRequest).user!;

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return reply.status(400).send({ error: 'Date must be in yyyy-MM-dd format' });
      }

      const data = await getDailyReportData(date);

      if (data.totalCount === 0) {
        return reply.status(404).send({ error: `No registrations found for ${date}` });
      }

      const pdfBuffer = await drawDailyPdf(data);
      const filename = `FAC_PYROS_Report_${date}.pdf`;

      await auditLog(user.userId, 'pdf_download', `report:${date}`);

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(pdfBuffer);
    }
  );

  // GET /api/reports/pdf — flexible PDF report download
  app.get(
    '/api/reports/pdf',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { start, end, date } = request.query as { start?: string; end?: string; date?: string };
      const user = (request as AuthedRequest).user!;

      const targetDate = date || end || start || format(new Date(), 'yyyy-MM-dd');
      let data = await getDailyReportData(targetDate);

      // If no registrations on that exact day, fall back to the most recent registration date
      if (data.totalCount === 0) {
        const latestQuery = await query(`SELECT registration_date FROM registrations ORDER BY registration_date DESC LIMIT 1`);
        if (latestQuery.rows[0]?.registration_date) {
          const fallbackDate = String(latestQuery.rows[0].registration_date).split('T')[0];
          data = await getDailyReportData(fallbackDate);
        }
      }

      const pdfBuffer = await drawDailyPdf(data);
      const filename = `FAC_PYROS_Report_${data.date || targetDate}.pdf`;

      await auditLog(user.userId, 'pdf_download', `report:${data.date || targetDate}`);

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(pdfBuffer);
    }
  );

  // GET /api/reports/daily/today — convenience alias
  app.get('/api/reports/daily/today', { preHandler: [authenticate] }, async (request, reply) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return reply.redirect(`/api/reports/daily/${today}`);
  });
}
