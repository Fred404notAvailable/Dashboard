import { FastifyInstance } from 'fastify';
import { query } from '../database/db.js';
import { authenticate, requireRole, AuthedRequest } from '../middleware/auth.js';
import { resolvePreset, Preset } from '../services/dateUtils.js';
import { auditLog } from '../middleware/auditLog.js';
import { format } from 'date-fns';

export async function exportRoutes(app: FastifyInstance) {
  // GET /api/export/csv — streaming CSV export
  app.get('/api/export/csv', { preHandler: [authenticate, requireRole('admin', 'analyst')] }, async (request, reply) => {
    const { start, end, preset, type } = request.query as Record<string, string>;
    const user = (request as AuthedRequest).user!;

    let dateRange: { start: string; end: string };
    if (preset) dateRange = resolvePreset(preset as Preset);
    else if (start && end) dateRange = { start, end };
    else dateRange = resolvePreset('thisMonth');

    const conditions = ['registration_date BETWEEN $1 AND $2'];
    const params: any[] = [dateRange.start, dateRange.end];
    if (type) {
      conditions.push('registration_type = $3');
      params.push(parseInt(type));
    }

    const result = await query(
      `SELECT s_no, registrant_name, reg_no, year, department, school, mobile_no,
              event_1, event_2, event_3, payment_method, registration_type, registration_date
       FROM registrations WHERE ${conditions.join(' AND ')}
       ORDER BY registration_date, s_no`,
      params
    );

    // Build CSV
    const headers = ['S.No', 'Name', 'Reg No', 'Year', 'Department', 'School', 'Mobile No',
                     'Event 1', 'Event 2', 'Event 3', 'Payment Method', 'Fee Tier (₹)', 'Date'];
    const rows = result.rows.map(r =>
      [r.s_no, r.registrant_name, r.reg_no, r.year, r.department, r.school, r.mobile_no,
       r.event_1, r.event_2, r.event_3, r.payment_method, r.registration_type,
       format(new Date(r.registration_date), 'yyyy-MM-dd')
      ].map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `FAC_PYROS_Registrations_${dateRange.start}_to_${dateRange.end}.csv`;

    await auditLog(user.userId, 'export', `csv:${dateRange.start}..${dateRange.end}`, { rows: result.rows.length });

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  });

  // GET /api/export/xlsx — multi-sheet Excel export
  app.get('/api/export/xlsx', { preHandler: [authenticate, requireRole('admin', 'analyst')] }, async (request, reply) => {
    const { start, end, preset, type } = request.query as Record<string, string>;
    const user = (request as AuthedRequest).user!;

    let dateRange: { start: string; end: string };
    if (preset) dateRange = resolvePreset(preset as Preset);
    else if (start && end) dateRange = { start, end };
    else dateRange = resolvePreset('thisMonth');

    // Dynamic import to avoid loading ExcelJS unless needed
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FAC PYROS Dashboard';
    workbook.created = new Date();

    const goldColor = 'D4A843';
    const darkRedColor = '8B1A1A';
    const blackColor = '1A1A1A';

    // --- Sheet 1: Summary Stats ---
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 35 },
      { header: 'Value', key: 'value', width: 25 },
    ];

    // Get summary data
    const totalResult = await query(
      `SELECT registration_type, COUNT(*) as count FROM registrations
       WHERE registration_date BETWEEN $1 AND $2 GROUP BY registration_type`,
      [dateRange.start, dateRange.end]
    );
    const type200 = parseInt(totalResult.rows.find(r => r.registration_type === 200)?.count || '0');
    const type250 = parseInt(totalResult.rows.find(r => r.registration_type === 250)?.count || '0');

    summarySheet.addRows([
      { metric: 'Report Period', value: `${dateRange.start} to ${dateRange.end}` },
      { metric: 'Total Registrations', value: type200 + type250 },
      { metric: '₹200 Tier Count', value: type200 },
      { metric: '₹250 Tier Count', value: type250 },
      { metric: 'Total Revenue', value: `₹${(type200 * 200 + type250 * 250).toLocaleString()}` },
      { metric: '₹200 Tier Revenue', value: `₹${(type200 * 200).toLocaleString()}` },
      { metric: '₹250 Tier Revenue', value: `₹${(type250 * 250).toLocaleString()}` },
    ]);

    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${blackColor}` } };

    // --- Sheet 2: Raw Data ---
    const conditions = ['registration_date BETWEEN $1 AND $2'];
    const params: any[] = [dateRange.start, dateRange.end];
    if (type) {
      conditions.push('registration_type = $3');
      params.push(parseInt(type));
    }

    const rawResult = await query(
      `SELECT s_no, registrant_name, reg_no, year, department, school, mobile_no,
              event_1, event_2, event_3, payment_method, registration_type, registration_date
       FROM registrations WHERE ${conditions.join(' AND ')}
       ORDER BY registration_type, registration_date, s_no`,
      params
    );

    const dataSheet = workbook.addWorksheet('Raw Data');
    dataSheet.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Reg No', key: 'regNo', width: 15 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Department', key: 'dept', width: 15 },
      { header: 'School', key: 'school', width: 25 },
      { header: 'Mobile No', key: 'mobile', width: 15 },
      { header: 'Event 1', key: 'event1', width: 15 },
      { header: 'Event 2', key: 'event2', width: 15 },
      { header: 'Event 3', key: 'event3', width: 15 },
      { header: 'Payment', key: 'payment', width: 15 },
      { header: 'Fee Tier', key: 'type', width: 10 },
      { header: 'Date', key: 'date', width: 12 },
    ];

    for (const r of rawResult.rows) {
      dataSheet.addRow({
        sno: r.s_no, name: r.registrant_name, regNo: r.reg_no, year: r.year,
        dept: r.department, school: r.school, mobile: r.mobile_no,
        event1: r.event_1, event2: r.event_2, event3: r.event_3,
        payment: r.payment_method, type: `₹${r.registration_type}`,
        date: format(new Date(r.registration_date), 'yyyy-MM-dd'),
      });
    }

    dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dataSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${darkRedColor}` } };
    dataSheet.autoFilter = { from: 'A1', to: { row: 1, column: 13 } };

    // --- Sheet 3: Event-wise Participant Lists ---
    const eventSheet = workbook.addWorksheet('Event Participants');
    const eventResult = await query(
      `SELECT event_name, registrant_name, reg_no, department, year, registration_type FROM (
        SELECT event_1 as event_name, registrant_name, reg_no, department, year, registration_type
        FROM registrations WHERE registration_date BETWEEN $1 AND $2 AND event_1 IS NOT NULL AND event_1 != ''
        UNION ALL
        SELECT event_2, registrant_name, reg_no, department, year, registration_type
        FROM registrations WHERE registration_date BETWEEN $1 AND $2 AND event_2 IS NOT NULL AND event_2 != ''
        UNION ALL
        SELECT event_3, registrant_name, reg_no, department, year, registration_type
        FROM registrations WHERE registration_date BETWEEN $1 AND $2 AND event_3 IS NOT NULL AND event_3 != ''
       ) e ORDER BY event_name, department, registrant_name`,
      [dateRange.start, dateRange.end]
    );

    eventSheet.columns = [
      { header: 'Event', key: 'event', width: 18 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Reg No', key: 'regNo', width: 15 },
      { header: 'Department', key: 'dept', width: 15 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Fee Tier', key: 'type', width: 10 },
    ];

    for (const r of eventResult.rows) {
      eventSheet.addRow({
        event: r.event_name, name: r.registrant_name, regNo: r.reg_no,
        dept: r.department, year: r.year, type: `₹${r.registration_type}`,
      });
    }

    eventSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    eventSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${goldColor}` } };
    eventSheet.autoFilter = { from: 'A1', to: { row: 1, column: 6 } };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `FAC_PYROS_Report_${dateRange.start}_to_${dateRange.end}.xlsx`;

    await auditLog(user.userId, 'export', `xlsx:${dateRange.start}..${dateRange.end}`, { rows: rawResult.rows.length });

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(Buffer.from(buffer as ArrayBuffer));
  });
}
