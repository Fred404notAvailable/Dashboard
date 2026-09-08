import { FastifyInstance } from 'fastify';
import PDFDocument from 'pdfkit';
import { query } from '../database/db.js';
import { authenticate, AuthedRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/auditLog.js';
import { resolvePreset, Preset } from '../services/dateUtils.js';
import { format, parseISO } from 'date-fns';

export interface ReportDataOptions {
  startDate?: string;
  endDate?: string;
  date?: string;
  preset?: string;
  type?: number;
  department?: string;
  school?: string;
  year?: string;
  event?: string;
  payment?: string;
}

export interface ReportData {
  startDate: string;
  endDate: string;
  isSingleDay: boolean;
  presetLabel: string;
  totalCount: number;
  type200: number;
  type250: number;
  revenue: number;
  byType: { rows: any[] };
  byPayment: { rows: any[] };
  byDept: { rows: any[] };
  byEvent: { rows: any[] };
  recent: { rows: any[] };
}

/** Gather all data needed to render a PDF report for a single date or date range. */
export async function getReportData(options: ReportDataOptions): Promise<ReportData> {
  let start = options.startDate;
  let end = options.endDate;
  let presetLabel = '';

  if (options.preset && options.preset !== 'custom') {
    const p = resolvePreset(options.preset as Preset);
    start = p.start;
    end = p.end;
    const presetLabels: Record<string, string> = {
      today: 'Today',
      yesterday: 'Yesterday',
      last7: 'Last 7 Days',
      last30: 'Last 30 Days',
      thisMonth: 'This Month',
      lastMonth: 'Last Month',
      thisQuarter: 'This Quarter',
      ytd: 'Year To Date (YTD)',
      all: 'All Time',
    };
    presetLabel = presetLabels[options.preset] || options.preset.toUpperCase();
  } else if (options.date) {
    start = options.date;
    end = options.date;
    presetLabel = 'Daily Report';
  } else if (!start && !end) {
    start = format(new Date(), 'yyyy-MM-dd');
    end = format(new Date(), 'yyyy-MM-dd');
    presetLabel = 'Today';
  } else {
    if (!start) start = end!;
    if (!end) end = start!;
    if (start === end) {
      presetLabel = start === format(new Date(), 'yyyy-MM-dd') ? 'Today' : 'Daily Report';
    } else {
      presetLabel = 'Custom Range';
    }
  }

  const isSingleDay = start === end;
  const conditions: string[] = ['registration_date BETWEEN $1 AND $2'];
  const params: any[] = [start, end];

  if (options.type) {
    conditions.push(`registration_type = $${params.length + 1}`);
    params.push(options.type);
  }
  if (options.department) {
    conditions.push(`department = $${params.length + 1}`);
    params.push(options.department);
  }
  if (options.payment) {
    conditions.push(`payment_method = $${params.length + 1}`);
    params.push(options.payment);
  }
  if (options.school) {
    conditions.push(`school = $${params.length + 1}`);
    params.push(options.school);
  }
  if (options.year) {
    conditions.push(`year = $${params.length + 1}`);
    params.push(options.year);
  }
  if (options.event) {
    const idx = params.length + 1;
    conditions.push(`(event_1 = $${idx} OR event_2 = $${idx} OR event_3 = $${idx})`);
    params.push(options.event);
  }

  const whereClause = conditions.join(' AND ');

  const [total, byType, byPayment, byDept, byEvent, recent] = await Promise.all([
    // Total count & Tier breakdown
    query(
      `SELECT COUNT(*) as total,
        SUM(CASE WHEN registration_type = 200 THEN 1 ELSE 0 END) as type200,
        SUM(CASE WHEN registration_type = 250 THEN 1 ELSE 0 END) as type250
       FROM registrations WHERE ${whereClause}`,
      params
    ),
    // Revenue by type
    query(
      `SELECT registration_type, COUNT(*) as count
       FROM registrations WHERE ${whereClause}
       GROUP BY registration_type`,
      params
    ),
    // Payment method breakdown
    query(
      `SELECT payment_method, COUNT(*) as count,
        SUM(CASE WHEN registration_type = 200 THEN 200 ELSE 250 END) as est_revenue
       FROM registrations WHERE ${whereClause}
       GROUP BY payment_method ORDER BY count DESC`,
      params
    ),
    // Department breakdown
    query(
      `SELECT department, COUNT(*) as count
       FROM registrations WHERE ${whereClause}
       GROUP BY department ORDER BY count DESC`,
      params
    ),
    // Event popularity
    query(
      `SELECT event_name, COUNT(*) as count FROM (
         SELECT event_1 as event_name, registration_date, registration_type, department, payment_method, school, year FROM registrations WHERE ${whereClause} AND event_1 IS NOT NULL AND event_1 != ''
         UNION ALL
         SELECT event_2, registration_date, registration_type, department, payment_method, school, year FROM registrations WHERE ${whereClause} AND event_2 IS NOT NULL AND event_2 != ''
         UNION ALL
         SELECT event_3, registration_date, registration_type, department, payment_method, school, year FROM registrations WHERE ${whereClause} AND event_3 IS NOT NULL AND event_3 != ''
       ) e GROUP BY event_name ORDER BY count DESC`,
      params
    ),
    // Recent registrations in that window
    query(
      `SELECT registrant_name, reg_no, department, year, registration_type, event_1, event_2, event_3, payment_method, registration_date
       FROM registrations WHERE ${whereClause}
       ORDER BY registration_date DESC, synced_at DESC LIMIT 15`,
      params
    ),
  ]);

  const t = total.rows[0];
  const totalCount = parseInt(t?.total || '0', 10);
  const type200 = parseInt(t?.type200 || '0', 10);
  const type250 = parseInt(t?.type250 || '0', 10);
  const revenue = type200 * 200 + type250 * 250;

  return {
    startDate: start,
    endDate: end,
    isSingleDay,
    presetLabel,
    totalCount,
    type200,
    type250,
    revenue,
    byType,
    byPayment,
    byDept,
    byEvent,
    recent,
  };
}

// ─── PDF Renderer ──────────────────────────────────────────────────────────

export function drawPdfReport(data: ReportData): Promise<Buffer> {
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
    let formattedDate = data.startDate;
    try {
      if (data.isSingleDay) {
        formattedDate = format(parseISO(data.startDate), 'dd MMMM yyyy');
      } else {
        const s = format(parseISO(data.startDate), 'dd MMM yyyy');
        const e = format(parseISO(data.endDate), 'dd MMM yyyy');
        formattedDate = `${s} – ${e}`;
      }
    } catch {
      formattedDate = data.isSingleDay ? data.startDate : `${data.startDate} to ${data.endDate}`;
    }

    // ── 1. Top Header Banner ────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 76).fill(DARK);

    doc.fillColor(GOLD).fontSize(17).font('Helvetica-Bold')
      .text('FAC PYROS — REGISTRATION REPORT', MARGIN, 18, { width: USABLE_W - 170 });

    const subtitle = data.isSingleDay
      ? "That's How We Rock It!  •  Executive Daily Summary"
      : `That's How We Rock It!  •  ${data.presetLabel || 'Comprehensive'} Registration & Analytics Report`;

    doc.fillColor('#94A3B8').fontSize(8.5).font('Helvetica')
      .text(subtitle, MARGIN, 42, { width: USABLE_W - 170 });

    // Date Pill on Top-Right
    const datePillW = 165;
    const datePillX = doc.page.width - MARGIN - datePillW;
    doc.roundedRect(datePillX, 18, datePillW, 40, 4).fillAndStroke('#1E293B', GOLD);
    doc.fillColor(GOLD).fontSize(7.5).font('Helvetica-Bold')
      .text(data.isSingleDay ? 'REPORT DATE' : `PERIOD (${(data.presetLabel || 'CUSTOM').toUpperCase()})`, datePillX, 23, { width: datePillW, align: 'center' });
    doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold')
      .text(formattedDate, datePillX, 36, { width: datePillW, align: 'center' });

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

    if (payRows.length === 0) {
      doc.rect(col1X, curY, colW, 14).fillAndStroke('#FFFFFF', BORDER_COLOR);
      doc.fillColor(TEXT_MUTED).fontSize(7.5).font('Helvetica')
        .text('No payment records for this period', col1X + 6, curY + 3, { width: colW - 12, align: 'center' });
      curY += 14;
    } else {
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
    }

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
    if (deptRows.length === 0) {
      doc.rect(col1X, curY, colW, 14).fillAndStroke('#FFFFFF', BORDER_COLOR);
      doc.fillColor(TEXT_MUTED).fontSize(7.5).font('Helvetica')
        .text('No department records for this period', col1X + 6, curY + 3, { width: colW - 12, align: 'center' });
      curY += 14;
    } else {
      deptRows.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? '#FFFFFF' : GRAY_BG;
        doc.rect(col1X, curY, colW, 14).fillAndStroke(bg, BORDER_COLOR);
        doc.fillColor(TEXT_PRIMARY).fontSize(7.5).font('Helvetica')
          .text(r.department || 'Unknown', col1X + 6, curY + 3, { width: 170 })
          .text(String(r.count), col1X + 180, curY + 3, { width: colW - 186, align: 'right' });
        curY += 14;
      });
    }

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
    if (eventRows.length === 0) {
      doc.rect(col2X, eventY, colW, 14).fillAndStroke('#FFFFFF', BORDER_COLOR);
      doc.fillColor(TEXT_MUTED).fontSize(7.5).font('Helvetica')
        .text('No event records for this period', col2X + 6, eventY + 3, { width: colW - 12, align: 'center' });
      eventY += 14;
    } else {
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
    }

    // ── 4. Bottom Table: Latest Registrations Roster (y = 316) ───────────────
    let tableY = Math.max(curY, eventY) + 12;
    const rosterTitle = data.isSingleDay
      ? `Registrations Roster (Showing ${data.recent.rows.length} records)`
      : `Latest Registrations in Period (Showing ${data.recent.rows.length} records)`;
    drawHeader(rosterTitle, MARGIN, tableY, USABLE_W);
    tableY += 22;

    const isSingle = data.isSingleDay;
    // Single-day colDefs: Name (110), RegNo (75), Dept (70), Tier (45), Pay (45), Events (178) = 523
    // Multi-day colDefs: Name (95), RegNo (70), Dept (60), Date (58), Tier (40), Pay (40), Events (160) = 523
    const colDefs = isSingle
      ? [
          { key: 'name', label: 'STUDENT NAME', width: 110, align: 'left' },
          { key: 'regNo', label: 'REG NO', width: 75, align: 'left' },
          { key: 'dept', label: 'DEPT', width: 70, align: 'left' },
          { key: 'tier', label: 'TIER', width: 45, align: 'center' },
          { key: 'pay', label: 'PAY', width: 45, align: 'center' },
          { key: 'events', label: 'REGISTERED EVENTS', width: 178, align: 'left' },
        ]
      : [
          { key: 'name', label: 'STUDENT NAME', width: 95, align: 'left' },
          { key: 'regNo', label: 'REG NO', width: 70, align: 'left' },
          { key: 'dept', label: 'DEPT', width: 60, align: 'left' },
          { key: 'date', label: 'DATE', width: 58, align: 'center' },
          { key: 'tier', label: 'TIER', width: 40, align: 'center' },
          { key: 'pay', label: 'PAY', width: 40, align: 'center' },
          { key: 'events', label: 'REGISTERED EVENTS', width: 160, align: 'left' },
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

    if (data.recent.rows.length === 0) {
      doc.rect(MARGIN, tableY, USABLE_W, 20).fillAndStroke('#FFFFFF', BORDER_COLOR);
      doc.fillColor(TEXT_MUTED).fontSize(7.5).font('Helvetica')
        .text('No registration records found for the selected timeframe.', MARGIN, tableY + 6, { width: USABLE_W, align: 'center' });
      tableY += 20;
    } else {
      // Draw Data Rows
      data.recent.rows.forEach((r, idx) => {
        const eventsStr = [r.event_1, r.event_2, r.event_3].filter(Boolean).join(', ') || '—';
        doc.fontSize(6.8);
        const eventsH = doc.heightOfString(eventsStr, { width: isSingle ? 170 : 152 });
        const rowHeight = Math.max(15, eventsH + 4);

        const bg = idx % 2 === 0 ? '#FFFFFF' : GRAY_BG;
        doc.rect(MARGIN, tableY, USABLE_W, rowHeight).fillAndStroke(bg, BORDER_COLOR);

        let rx = MARGIN;

        if (isSingle) {
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
        } else {
          // Multi-day layout
          // 1. Name
          doc.fillColor(TEXT_PRIMARY).fontSize(7.2).font('Helvetica-Bold')
            .text(r.registrant_name || '—', rx + 4, tableY + 3, { width: 87, lineBreak: false });
          rx += 95;

          // 2. Reg No
          doc.fillColor(TEXT_MUTED).fontSize(6.8).font('Helvetica')
            .text(r.reg_no || '—', rx + 4, tableY + 3, { width: 62, lineBreak: false });
          rx += 70;

          // 3. Dept
          doc.fillColor(TEXT_PRIMARY).fontSize(6.8).font('Helvetica')
            .text(r.department || '—', rx + 4, tableY + 3, { width: 52, lineBreak: false });
          rx += 60;

          // 4. Date
          const rDate = r.registration_date ? String(r.registration_date).split('T')[0] : '—';
          doc.fillColor(TEXT_MUTED).fontSize(6.5).font('Helvetica')
            .text(rDate, rx + 2, tableY + 3, { width: 54, align: 'center', lineBreak: false });
          rx += 58;

          // 5. Tier
          doc.fillColor(r.registration_type === 200 ? '#3B82F6' : '#8B1A1A').fontSize(7.2).font('Helvetica-Bold')
            .text(`Rs. ${r.registration_type}`, rx + 2, tableY + 3, { width: 36, align: 'center' });
          rx += 40;

          // 6. Payment
          doc.fillColor(TEXT_MUTED).fontSize(6.8).font('Helvetica')
            .text(r.payment_method || 'CASH', rx + 2, tableY + 3, { width: 36, align: 'center' });
          rx += 40;

          // 7. Events
          doc.fillColor(TEXT_PRIMARY).fontSize(6.8).font('Helvetica')
            .text(eventsStr, rx + 4, tableY + 2.5, { width: 152 });
        }

        tableY += rowHeight;
      });
    }

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
  // GET /api/reports/pdf — dynamic & filter-aware PDF report download
  app.get(
    '/api/reports/pdf',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { start, end, date, preset, type, department, school, year, event, payment } = request.query as Record<string, string>;
      const user = (request as AuthedRequest).user!;

      const reportData = await getReportData({
        startDate: start,
        endDate: end,
        date,
        preset,
        type: type ? parseInt(type, 10) : undefined,
        department,
        school,
        year,
        event,
        payment,
      });

      const pdfBuffer = await drawPdfReport(reportData);

      const filename = reportData.isSingleDay
        ? `FAC_PYROS_Report_${reportData.startDate}.pdf`
        : `FAC_PYROS_Report_${reportData.startDate}_to_${reportData.endDate}.pdf`;

      await auditLog(
        user.userId,
        'pdf_download',
        `report:${reportData.startDate}..${reportData.endDate}`,
        { totalCount: reportData.totalCount, revenue: reportData.revenue, preset: preset || 'custom' }
      );

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(pdfBuffer);
    }
  );

  // GET /api/reports/daily/:date — PDF download for a specific date (legacy alias)
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

      const reportData = await getReportData({ date });

      if (reportData.totalCount === 0) {
        return reply.status(404).send({ error: `No registrations found for ${date}` });
      }

      const pdfBuffer = await drawPdfReport(reportData);
      const filename = `FAC_PYROS_Report_${date}.pdf`;

      await auditLog(user.userId, 'pdf_download', `report:${date}`, { totalCount: reportData.totalCount });

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
