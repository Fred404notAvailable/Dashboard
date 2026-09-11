import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getReportData, drawPdfReport } from '../src/routes/pdf.js';
import { buildApp } from '../src/app.js';
import { closePool } from '../src/database/db.js';
import { closeRedis } from '../src/services/cache.js';
import { FastifyInstance } from 'fastify';

describe('PDF Dynamic Timeframe Reports', () => {
  let app: FastifyInstance;
  let authCookie: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Login as overall admin
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'admin@facpyros.in',
        password: 'admin123',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.body);
    authCookie = `Bearer ${body.accessToken}`;
  });

  it('should generate report data for YTD preset', async () => {
    const data = await getReportData({ preset: 'ytd' });
    expect(data.presetLabel).toBe('Year To Date (YTD)');
    expect(data.isSingleDay).toBe(false);
    expect(data.totalCount).toBeGreaterThanOrEqual(0);
    expect(typeof data.revenue).toBe('number');
    expect(Array.isArray(data.byPayment.rows)).toBe(true);
    expect(Array.isArray(data.byDept.rows)).toBe(true);
    expect(Array.isArray(data.byEvent.rows)).toBe(true);
    expect(Array.isArray(data.recent.rows)).toBe(true);

    const buffer = await drawPdfReport(data);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    // PDF Magic Number %PDF-
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('should generate report data for Last 30 Days preset', async () => {
    const data = await getReportData({ preset: 'last30' });
    expect(data.presetLabel).toBe('Last 30 Days');
    expect(data.isSingleDay).toBe(false);

    const buffer = await drawPdfReport(data);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('should generate report data for a single date', async () => {
    const data = await getReportData({ date: '2026-08-15' });
    expect(data.isSingleDay).toBe(true);
    expect(data.startDate).toBe('2026-08-15');
    expect(data.endDate).toBe('2026-08-15');

    const buffer = await drawPdfReport(data);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('should generate report data for a custom date range', async () => {
    const data = await getReportData({ startDate: '2026-08-01', endDate: '2026-08-20' });
    expect(data.isSingleDay).toBe(false);
    expect(data.startDate).toBe('2026-08-01');
    expect(data.endDate).toBe('2026-08-20');

    const buffer = await drawPdfReport(data);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('should download PDF report from /api/reports/pdf endpoint with YTD query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/pdf?preset=ytd',
      headers: {
        authorization: authCookie,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment; filename="FAC_PYROS_Report_');
    const bodyBuffer = res.rawPayload;
    expect(bodyBuffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('should download PDF report from /api/reports/pdf endpoint with custom start and end range', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/pdf?start=2026-08-01&end=2026-08-31',
      headers: {
        authorization: authCookie,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="FAC_PYROS_Report_2026-08-01_to_2026-08-31.pdf"');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closePool();
    await closeRedis();
  });
});
