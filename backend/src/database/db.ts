import { Pool } from 'pg';
import dotenv from 'dotenv';
import { MOCK_USERS, MOCK_REGISTRATIONS, MockRegistration } from './mockData.js';
dotenv.config();

let isPostgresConnected = false;
let fallbackLogged = false;

interface MockSyncError {
  id: string;
  sheet_tab: string;
  row_number: number;
  raw_row: string;
  errors: string;
  flagged_at: string;
  resolved: boolean;
}

interface MockAuditLog {
  id: string;
  user_id: string | null;
  action_type: string;
  resource: string | null;
  metadata: string | null;
  created_at: string;
}

const MOCK_SYNC_ERRORS: MockSyncError[] = [];
const MOCK_AUDIT_LOGS: MockAuditLog[] = [];

let activeSyncId: string | null = null;
let lastSyncInfo = {
  id: 'sync_init',
  started_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
  status: 'success',
  rows_processed: 0,
  rows_inserted: 0,
  rows_updated: 0,
  rows_failed: 0,
  error_message: null as string | null,
  triggered_by: 'system',
};

let appSettingsStore: Record<string, string> = {
  registration_goal: '500',
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://pyros:pyros_dev_2026@localhost:5432/registrations',
  connectionTimeoutMillis: 2000,
});

/**
 * Handle common queries against in-memory data when PostgreSQL is unreachable
 */
function handleMockQuery<T = any>(text: string, params: any[] = []): { rows: T[] } {
  const normalized = text.replace(/\s+/g, ' ').trim().toUpperCase();

  if (!fallbackLogged) {
    console.info('💡 [DB] PostgreSQL is offline — serving responses via In-Memory Live Sync Store');
    fallbackLogged = true;
  }

  // 1. Insert / Upsert into registrations
  if (normalized.startsWith('INSERT INTO REGISTRATIONS')) {
    const hash = params[13] || `hash_${Date.now()}_${Math.random()}`;
    const sNo = params[0] || null;
    const name = String(params[2] || '').trim().toLowerCase();
    const type = Number(params[12]) || 200;
    const existingIndex = MOCK_REGISTRATIONS.findIndex(
      r => r.source_row_hash === hash || (r.registration_type === type && r.s_no === sNo && r.registrant_name.trim().toLowerCase() === name)
    );

    const record: MockRegistration = {
      id: String(existingIndex >= 0 ? MOCK_REGISTRATIONS[existingIndex].id : MOCK_REGISTRATIONS.length + 1),
      s_no: params[0] || null,
      registration_date: params[1] || new Date().toISOString().split('T')[0],
      registrant_name: params[2] || '(unknown)',
      reg_no: params[3] || null,
      year: params[4] || null,
      department: params[5] || null,
      school: params[6] || null,
      mobile_no: params[7] || null,
      event_1: params[8] || null,
      event_2: params[9] || null,
      event_3: params[10] || null,
      payment_method: params[11] || 'CASH',
      registration_type: Number(params[12]) || 200,
      source_row_hash: hash,
      synced_at: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      MOCK_REGISTRATIONS[existingIndex] = record;
      return { rows: [{ is_insert: false }] as unknown as T[] };
    } else {
      MOCK_REGISTRATIONS.push(record);
      return { rows: [{ is_insert: true }] as unknown as T[] };
    }
  }

  // 2. User lookup by email
  if (normalized.includes('FROM USERS WHERE EMAIL =')) {
    const email = params[0]?.toLowerCase();
    const user = MOCK_USERS.find(u => u.email.toLowerCase() === email);
    return { rows: (user ? [user] : []) as unknown as T[] };
  }

  // 3. User lookup by id
  if (normalized.includes('FROM USERS WHERE ID =')) {
    const id = params[0];
    const user = MOCK_USERS.find(u => u.id === id);
    return { rows: (user ? [user] : []) as unknown as T[] };
  }

  // 4. Sync Status — Check if sync is running
  if (normalized.includes('FROM SYNC_STATUS WHERE STATUS =') && normalized.includes("'RUNNING'")) {
    if (activeSyncId) {
      return { rows: [{ id: activeSyncId }] as unknown as T[] };
    }
    return { rows: [] };
  }

  // 5. Sync Status — Insert new sync record
  if (normalized.startsWith('INSERT INTO SYNC_STATUS')) {
    const newId = 'sync_' + Date.now();
    activeSyncId = newId;
    const triggeredBy = params[0] || 'system';
    lastSyncInfo = {
      id: newId,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: 'running',
      rows_processed: 0,
      rows_inserted: 0,
      rows_updated: 0,
      rows_failed: 0,
      error_message: null,
      triggered_by: triggeredBy,
    };
    return { rows: [{ id: newId }] as unknown as T[] };
  }

  // 6. Sync Status — Update sync record
  if (normalized.startsWith('UPDATE SYNC_STATUS')) {
    activeSyncId = null;
    if (normalized.includes("STATUS = 'SUCCESS'")) {
      const syncId = params[0];
      const rows_processed = Number(params[1] || MOCK_REGISTRATIONS.length);
      const rows_inserted = Number(params[2] || 0);
      const rows_updated = Number(params[3] || 0);
      const rows_failed = Number(params[4] || 0);
      lastSyncInfo = {
        id: syncId,
        started_at: lastSyncInfo.started_at,
        completed_at: new Date().toISOString(),
        status: 'success',
        rows_processed,
        rows_inserted,
        rows_updated,
        rows_failed,
        error_message: null,
        triggered_by: lastSyncInfo.triggered_by,
      };
    } else if (normalized.includes("STATUS = 'FAILED'")) {
      const syncId = params[0];
      const error_message = params[1] || 'Unknown error';
      lastSyncInfo = {
        id: syncId,
        started_at: lastSyncInfo.started_at,
        completed_at: new Date().toISOString(),
        status: 'failed',
        rows_processed: 0,
        rows_inserted: 0,
        rows_updated: 0,
        rows_failed: 0,
        error_message,
        triggered_by: lastSyncInfo.triggered_by,
      };
    }
    return { rows: [] };
  }

  // 7. Sync Status — Get last sync info
  if (normalized.includes('FROM SYNC_STATUS')) {
    return {
      rows: [lastSyncInfo] as unknown as T[],
    };
  }

  // 8. Sync Errors — Insert
  if (normalized.startsWith('INSERT INTO SYNC_ERRORS')) {
    const err: MockSyncError = {
      id: 'err_' + (MOCK_SYNC_ERRORS.length + 1),
      sheet_tab: params[0],
      row_number: params[1],
      raw_row: params[2],
      errors: params[3],
      flagged_at: new Date().toISOString(),
      resolved: false,
    };
    MOCK_SYNC_ERRORS.push(err);
    return { rows: [] };
  }

  // 9. Sync Errors — Count unresolved
  if (normalized.includes('FROM SYNC_ERRORS WHERE NOT RESOLVED') && normalized.includes('COUNT(*)')) {
    const count = MOCK_SYNC_ERRORS.filter(e => !e.resolved).length;
    return { rows: [{ total: String(count) }] as unknown as T[] };
  }

  // 10. Sync Errors — List unresolved
  if (normalized.includes('FROM SYNC_ERRORS WHERE NOT RESOLVED')) {
    const unresolved = MOCK_SYNC_ERRORS.filter(e => !e.resolved);
    return { rows: unresolved as unknown as T[] };
  }

  // 11. Sync Errors — Resolve error
  if (normalized.startsWith('UPDATE SYNC_ERRORS SET RESOLVED = TRUE')) {
    const errId = params[0];
    const match = MOCK_SYNC_ERRORS.find(e => e.id === errId);
    if (match) {
      match.resolved = true;
      return { rows: [{ id: errId }] as unknown as T[] };
    }
    return { rows: [] };
  }

  // 12. Audit Logs — Insert
  if (normalized.startsWith('INSERT INTO AUDIT_LOGS')) {
    const log: MockAuditLog = {
      id: 'log_' + (MOCK_AUDIT_LOGS.length + 1),
      user_id: params[0] || null,
      action_type: params[1] || 'action',
      resource: params[2] || null,
      metadata: params[3] || null,
      created_at: new Date().toISOString(),
    };
    MOCK_AUDIT_LOGS.push(log);
    return { rows: [] };
  }

  // 13. Audit Logs — Count
  if (normalized.includes('FROM AUDIT_LOGS') && normalized.includes('COUNT(*)')) {
    return { rows: [{ total: String(MOCK_AUDIT_LOGS.length) }] as unknown as T[] };
  }

  // 14. Audit Logs — List
  if (normalized.includes('FROM AUDIT_LOGS AL LEFT JOIN USERS')) {
    const limit = Number(params[0]) || 50;
    const offset = Number(params[1]) || 0;
    const logs = [...MOCK_AUDIT_LOGS].reverse().slice(offset, offset + limit).map(l => {
      const u = MOCK_USERS.find(user => user.id === l.user_id);
      return {
        id: l.id,
        action_type: l.action_type,
        resource: l.resource,
        metadata: l.metadata ? JSON.parse(l.metadata) : null,
        created_at: l.created_at,
        user_email: u ? u.email : null,
        display_name: u ? u.display_name : null,
      };
    });
    return { rows: logs as unknown as T[] };
  }

  // 15. PDF / KPI Total count query
  if (normalized.includes('SELECT COUNT(*) AS TOTAL,') && normalized.includes('SUM(CASE WHEN REGISTRATION_TYPE = 200')) {
    const targetDate = params[0];
    const filtered = targetDate
      ? MOCK_REGISTRATIONS.filter(r => r.registration_date === targetDate)
      : MOCK_REGISTRATIONS;
    const t200 = filtered.filter(r => r.registration_type === 200).length;
    const t250 = filtered.filter(r => r.registration_type === 250).length;
    return {
      rows: [{
        total: String(filtered.length),
        type200: String(t200),
        type250: String(t250),
      }] as unknown as T[],
    };
  }

  // 16. Missing Mobile No count
  if (normalized.includes('MOBILE_NO IS NULL')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));
    const missing = filtered.filter(r => !r.mobile_no || !r.mobile_no.trim()).length;
    return { rows: [{ count: String(missing) }] as unknown as T[] };
  }

  // 17. Missing Payment Method count
  if (normalized.includes('PAYMENT_METHOD IS NULL')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));
    const missing = filtered.filter(r => !r.payment_method || !r.payment_method.trim()).length;
    return { rows: [{ count: String(missing) }] as unknown as T[] };
  }

  // 18. Registrations summary by type
  if (normalized.includes('SELECT REGISTRATION_TYPE, COUNT(*) AS COUNT FROM REGISTRATIONS WHERE REGISTRATION_DATE BETWEEN')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));

    const t200 = filtered.filter(r => r.registration_type === 200).length;
    const t250 = filtered.filter(r => r.registration_type === 250).length;

    return {
      rows: [
        { registration_type: 200, count: String(t200) },
        { registration_type: 250, count: String(t250) },
      ] as unknown as T[],
    };
  }

  // 19. Total count for previous period delta
  if (normalized.includes('SELECT COUNT(*) AS COUNT FROM REGISTRATIONS WHERE REGISTRATION_DATE BETWEEN')) {
    const start = params[0];
    const end = params[1];
    const count = MOCK_REGISTRATIONS.filter(r => r.registration_date >= start && r.registration_date <= end).length;
    return { rows: [{ count: String(count) }] as unknown as T[] };
  }

  // 20. Revenue by payment method
  if (normalized.includes('SELECT PAYMENT_METHOD, REGISTRATION_TYPE, COUNT(*) AS COUNT FROM REGISTRATIONS')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));

    const payTypeMap: Record<string, { payment_method: string; registration_type: number; count: number }> = {};
    for (const r of filtered) {
      const pm = (r.payment_method || 'CASH').toUpperCase();
      const key = `${pm}_${r.registration_type}`;
      if (!payTypeMap[key]) payTypeMap[key] = { payment_method: pm, registration_type: r.registration_type, count: 0 };
      payTypeMap[key].count++;
    }

    const rows = Object.values(payTypeMap).map(p => ({
      payment_method: p.payment_method,
      registration_type: p.registration_type,
      count: String(p.count),
    }));
    return { rows: rows as unknown as T[] };
  }

  // 21. Payment method breakdown
  if (normalized.includes('GROUP BY PAYMENT_METHOD')) {
    const targetDate = params.length === 1 ? params[0] : null;
    const start = params.length >= 2 ? params[0] : null;
    const end = params.length >= 2 ? params[1] : null;

    const filtered = MOCK_REGISTRATIONS.filter(r => {
      if (targetDate) return r.registration_date === targetDate;
      if (start && end) return r.registration_date >= start && r.registration_date <= end;
      return true;
    });

    const groups: Record<string, { count: number; est_revenue: number }> = {};
    for (const r of filtered) {
      const pm = (r.payment_method || 'CASH').toUpperCase();
      if (!groups[pm]) groups[pm] = { count: 0, est_revenue: 0 };
      groups[pm].count++;
      groups[pm].est_revenue += (r.registration_type === 200 ? 200 : 250);
    }

    const rows = Object.entries(groups)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([payment_method, data]) => ({
        payment_method,
        count: String(data.count),
        est_revenue: String(data.est_revenue),
      }));
    return { rows: rows as unknown as T[] };
  }

  // 22. Department breakdown
  if (normalized.includes('GROUP BY DEPARTMENT')) {
    const targetDate = params.length === 1 ? params[0] : null;
    const start = params.length >= 2 ? params[0] : null;
    const end = params.length >= 2 ? params[1] : null;

    const filtered = MOCK_REGISTRATIONS.filter(r => {
      if (targetDate) return r.registration_date === targetDate;
      if (start && end) return r.registration_date >= start && r.registration_date <= end;
      return true;
    });

    const counts: Record<string, number> = {};
    for (const r of filtered) {
      const dept = r.department || 'Other';
      counts[dept] = (counts[dept] || 0) + 1;
    }
    const rows = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([department, count]) => ({ department, count: String(count) }));
    return { rows: rows as unknown as T[] };
  }

  // 23. School-wise breakdown with registration_type split
  if (normalized.includes('GROUP BY SCHOOL, REGISTRATION_TYPE')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));

    const schoolTypeMap: Record<string, Record<number, number>> = {};
    for (const r of filtered) {
      const s = r.school || 'Other';
      if (!schoolTypeMap[s]) schoolTypeMap[s] = { 200: 0, 250: 0 };
      schoolTypeMap[s][r.registration_type] = (schoolTypeMap[s][r.registration_type] || 0) + 1;
    }
    const rows: { school: string; registration_type: number; count: string }[] = [];
    for (const [school, types] of Object.entries(schoolTypeMap)) {
      if (types[200]) rows.push({ school, registration_type: 200, count: String(types[200]) });
      if (types[250]) rows.push({ school, registration_type: 250, count: String(types[250]) });
    }
    return { rows: rows as unknown as T[] };
  }

  // 24. School comparison (aggregated total & revenue)
  if (normalized.includes('SELECT SCHOOL,') && normalized.includes('COUNT(*) AS TOTAL')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));

    const schools: Record<string, { school: string; type200: number; type250: number; total: number; revenue: number }> = {};
    for (const r of filtered) {
      const s = r.school || 'Other';
      if (!schools[s]) schools[s] = { school: s, type200: 0, type250: 0, total: 0, revenue: 0 };
      if (r.registration_type === 200) {
        schools[s].type200++;
        schools[s].revenue += 200;
      } else {
        schools[s].type250++;
        schools[s].revenue += 250;
      }
      schools[s].total++;
    }
    return { rows: Object.values(schools) as unknown as T[] };
  }

  // 25. Year breakdown
  if (normalized.includes('SELECT YEAR, COUNT(*) AS COUNT FROM REGISTRATIONS')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));

    const counts: Record<string, number> = {};
    for (const r of filtered) {
      if (r.year) counts[r.year] = (counts[r.year] || 0) + 1;
    }
    const rows = Object.entries(counts).map(([year, count]) => ({ year, count: String(count) }));
    return { rows: rows as unknown as T[] };
  }

  // 26. Event popularity (count across event_1, event_2, event_3)
  if (normalized.includes('UNION ALL') && normalized.includes('GROUP BY EVENT_NAME')) {
    const targetDate = params.length === 1 ? params[0] : null;
    const start = params.length >= 2 ? params[0] : null;
    const end = params.length >= 2 ? params[1] : null;

    const filtered = MOCK_REGISTRATIONS.filter(r => {
      if (targetDate) return r.registration_date === targetDate;
      if (start && end) return r.registration_date >= start && r.registration_date <= end;
      return true;
    });

    const eventCounts: Record<string, number> = {};
    for (const r of filtered) {
      if (r.event_1) eventCounts[r.event_1] = (eventCounts[r.event_1] || 0) + 1;
      if (r.event_2) eventCounts[r.event_2] = (eventCounts[r.event_2] || 0) + 1;
      if (r.event_3) eventCounts[r.event_3] = (eventCounts[r.event_3] || 0) + 1;
    }
    const rows = Object.entries(eventCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([event_name, count]) => ({ event_name, count: String(count) }));
    return { rows: rows as unknown as T[] };
  }

  // 27. Event combinations
  if (normalized.includes('GROUP BY COMBO') || normalized.includes('CASE WHEN EVENT_3 IS NOT NULL')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));

    const comboCounts: Record<string, number> = {};
    for (const r of filtered) {
      if (!r.event_1) continue;
      let combo = r.event_1;
      if (r.event_3) combo = `${r.event_1} + ${r.event_2} + ${r.event_3}`;
      else if (r.event_2) combo = `${r.event_1} + ${r.event_2}`;
      comboCounts[combo] = (comboCounts[combo] || 0) + 1;
    }
    const rows = Object.entries(comboCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([combo, count]) => ({ combo, count: String(count) }));
    return { rows: rows as unknown as T[] };
  }

  // 28. Event-wise Participant Lists (for XLSX & reports)
  if (normalized.includes('ORDER BY EVENT_NAME, DEPARTMENT, REGISTRANT_NAME')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));

    const results: any[] = [];
    for (const r of filtered) {
      if (r.event_1) results.push({ event_name: r.event_1, registrant_name: r.registrant_name, reg_no: r.reg_no, department: r.department, year: r.year, registration_type: r.registration_type });
      if (r.event_2) results.push({ event_name: r.event_2, registrant_name: r.registrant_name, reg_no: r.reg_no, department: r.department, year: r.year, registration_type: r.registration_type });
      if (r.event_3) results.push({ event_name: r.event_3, registrant_name: r.registrant_name, reg_no: r.reg_no, department: r.department, year: r.year, registration_type: r.registration_type });
    }
    results.sort((a, b) => a.event_name.localeCompare(b.event_name) || (a.department || '').localeCompare(b.department || '') || a.registrant_name.localeCompare(b.registrant_name));
    return { rows: results as unknown as T[] };
  }

  // 29. Specific Event Participants query
  if (normalized.includes('(EVENT_1 = $') && normalized.includes('OR EVENT_2 = $') && normalized.includes('OR EVENT_3 = $') && normalized.includes('FROM REGISTRATIONS WHERE REGISTRATION_DATE BETWEEN')) {
    const start = params[0];
    const end = params[1];
    const targetEvent = params[2];

    const filtered = MOCK_REGISTRATIONS.filter(r => {
      const inDate = !start || !end || (r.registration_date >= start && r.registration_date <= end);
      const hasEvent = r.event_1 === targetEvent || r.event_2 === targetEvent || r.event_3 === targetEvent;
      return inDate && hasEvent;
    });

    const rows = filtered.map(r => ({
      registrant_name: r.registrant_name,
      reg_no: r.reg_no,
      year: r.year,
      department: r.department,
      school: r.school,
      registration_type: r.registration_type,
    }));
    return { rows: rows as unknown as T[] };
  }

  // 30. Daily volume / trends
  if (normalized.includes('GROUP BY REGISTRATION_DATE, REGISTRATION_TYPE') || (normalized.includes('GROUP BY REGISTRATION_DATE') && normalized.includes('REGISTRATION_TYPE'))) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));

    const counts: Record<string, { type200: number; type250: number }> = {};
    for (const r of filtered) {
      const d = r.registration_date;
      if (!counts[d]) counts[d] = { type200: 0, type250: 0 };
      if (r.registration_type === 200) counts[d].type200++;
      else counts[d].type250++;
    }
    const rows: { registration_date: string; registration_type: number; count: string }[] = [];
    for (const [date, val] of Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (val.type200 > 0) rows.push({ registration_date: date, registration_type: 200, count: String(val.type200) });
      if (val.type250 > 0) rows.push({ registration_date: date, registration_type: 250, count: String(val.type250) });
    }
    return { rows: rows as unknown as T[] };
  }

  // 31. Cumulative totals
  if (normalized.includes('SUM(COUNT(*)) OVER (ORDER BY REGISTRATION_DATE) AS CUMULATIVE')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));

    const dayCounts: Record<string, number> = {};
    for (const r of filtered) {
      const d = r.registration_date;
      dayCounts[d] = (dayCounts[d] || 0) + 1;
    }

    let runningTotal = 0;
    const rows = Object.entries(dayCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => {
        runningTotal += count;
        return {
          registration_date: date,
          count: String(count),
          cumulative: String(runningTotal),
        };
      });
    return { rows: rows as unknown as T[] };
  }

  // 32. Duplicate detection across registration tiers
  if (normalized.includes('COUNT(DISTINCT REGISTRATION_TYPE)') || normalized.includes('HAVING COUNT(DISTINCT REGISTRATION_TYPE)')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));

    const groupMap: Record<string, { name: string; mobile: string; types: Set<number> }> = {};
    for (const r of filtered) {
      if (r.mobile_no) {
        const key = `${r.registrant_name.toLowerCase().trim()}_${r.mobile_no.trim()}`;
        if (!groupMap[key]) {
          groupMap[key] = { name: r.registrant_name, mobile: r.mobile_no, types: new Set() };
        }
        groupMap[key].types.add(r.registration_type);
      }
    }

    const duplicates = Object.values(groupMap)
      .filter(g => g.types.size > 1)
      .map(g => ({
        registrant_name: g.name,
        mobile_no: g.mobile,
        tier_count: String(g.types.size),
      }));

    return { rows: duplicates as unknown as T[] };
  }

  // 33. Registration velocity
  if (normalized.includes('GROUP BY REGISTRATION_DATE ORDER BY REGISTRATION_DATE DESC LIMIT 7')) {
    const start = params[0];
    const end = params[1];
    const filtered = MOCK_REGISTRATIONS.filter(r => !start || !end || (r.registration_date >= start && r.registration_date <= end));

    const counts: Record<string, number> = {};
    for (const r of filtered) {
      const d = r.registration_date;
      counts[d] = (counts[d] || 0) + 1;
    }
    const rows = Object.entries(counts)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 7)
      .map(([date, count]) => ({ registration_date: date, count: String(count) }));
    return { rows: rows as unknown as T[] };
  }

  // 34. Forecast query (daily historical counts)
  if (normalized.includes('SELECT REGISTRATION_DATE AS DATE, COUNT(*) AS COUNT FROM REGISTRATIONS')) {
    const counts: Record<string, number> = {};
    for (const r of MOCK_REGISTRATIONS) {
      if (r.registration_date) {
        counts[r.registration_date] = (counts[r.registration_date] || 0) + 1;
      }
    }
    const rows = Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count: String(count) }));
    return { rows: rows as unknown as T[] };
  }

  // 35. Total count of registrations
  if (normalized.includes('SELECT COUNT(*) AS TOTAL FROM REGISTRATIONS') || normalized.includes('SELECT COUNT(*) AS COUNT FROM REGISTRATIONS')) {
    const start = params[0];
    const end = params[1];
    if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
      const count = MOCK_REGISTRATIONS.filter(r => r.registration_date >= start && r.registration_date <= end).length;
      return { rows: [{ total: String(count), count: String(count) }] as unknown as T[] };
    }
    return { rows: [{ total: String(MOCK_REGISTRATIONS.length), count: String(MOCK_REGISTRATIONS.length) }] as unknown as T[] };
  }

  // 36. Latest registration date
  if (normalized.includes('SELECT REGISTRATION_DATE FROM REGISTRATIONS ORDER BY REGISTRATION_DATE DESC LIMIT 1')) {
    if (MOCK_REGISTRATIONS.length === 0) return { rows: [] };
    const sorted = [...MOCK_REGISTRATIONS].sort((a, b) => b.registration_date.localeCompare(a.registration_date));
    return { rows: [{ registration_date: sorted[0].registration_date }] as unknown as T[] };
  }

  // 37. Recent registrations feed
  if (normalized.includes('ORDER BY SYNCED_AT DESC LIMIT')) {
    const limit = Number(params[0]) || 10;
    const sorted = [...MOCK_REGISTRATIONS].sort((a, b) => b.synced_at.localeCompare(a.synced_at)).slice(0, limit);
    return { rows: sorted as unknown as T[] };
  }

  // 38. App settings (read)
  if (normalized.includes('FROM APP_SETTINGS')) {
    const key = params[0];
    if (key) {
      const val = appSettingsStore[key] || '500';
      return { rows: [{ key, value: val }] as unknown as T[] };
    }
    const rows = Object.entries(appSettingsStore).map(([k, v]) => ({ key: k, value: v }));
    return { rows: rows as unknown as T[] };
  }

  // 39. App settings (write / upsert)
  if (normalized.includes('INTO APP_SETTINGS') || normalized.includes('UPDATE APP_SETTINGS')) {
    const val = String(params[0] || '500');
    appSettingsStore['registration_goal'] = val;
    return { rows: [{ key: 'registration_goal', value: val }] as unknown as T[] };
  }

  // 40. Generic registrations listing & export with filtering
  if (normalized.includes('FROM REGISTRATIONS')) {
    let filtered = [...MOCK_REGISTRATIONS];
    const start = params[0];
    const end = params[1];
    if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
      filtered = filtered.filter(r => r.registration_date >= start && r.registration_date <= end);
    }

    filtered.sort((a, b) => b.registration_date.localeCompare(a.registration_date) || ((b.s_no || 0) - (a.s_no || 0)));
    return { rows: filtered as unknown as T[] };
  }

  // Default fallback empty rows
  return { rows: [] };
}

// Simple wrapper to match the exact pg API structure so we don't have to change route handlers
export async function query<T = any>(
  text: string,
  params: any[] = []
): Promise<{ rows: T[] }> {
  try {
    const res = await pool.query(text, params);
    isPostgresConnected = true;
    return { rows: res.rows as T[] };
  } catch (err: any) {
    if (!isPostgresConnected) {
      // Execute in-memory live store fallback in offline/local development mode
      return handleMockQuery<T>(text, params);
    }
    console.error('Database query error:', err.message, '\nQuery:', text, '\nParams:', params);
    throw err;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1');
    isPostgresConnected = !!res.rowCount;
    return isPostgresConnected;
  } catch {
    isPostgresConnected = false;
    return false;
  }
}
