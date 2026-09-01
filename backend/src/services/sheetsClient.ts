/**
 * sheetsClient.ts — CSV-based Google Sheets sync (no API key / billing required)
 *
 * Uses the free public CSV export URL:
 *   https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}
 *
 * Prerequisites:
 *   1. Open your Google Sheet
 *   2. Share → "Anyone with the link" → Viewer
 *   3. Set GOOGLE_SHEET_ID in your .env (already done)
 *   4. Set GOOGLE_SHEET_GID_200 and GOOGLE_SHEET_GID_250 in your .env
 *      (the gid= number in the tab URL, e.g. gid=0 for the first tab)
 */

import crypto from 'crypto';
import { config } from '../config.js';
import { query } from '../database/db.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RegistrationRow {
  sNo: number | null;
  registrationDate: string | null;
  registrantName: string;
  regNo: string | null;
  year: string | null;
  department: string | null;
  school: string | null;
  mobileNo: string | null;
  event1: string | null;
  event2: string | null;
  event3: string | null;
  paymentMethod: string | null;
  registrationType: 200 | 250;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface SyncResult {
  rowsProcessed: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsFailed: number;
  errors: { tab: string; rowNumber: number; errors: string }[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Exponential-backoff retry wrapper */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[sheetsClient] attempt ${attempt} failed, retrying in ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

/** Parse a CSV line correctly, handling quoted fields with commas inside */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse date string into ISO yyyy-MM-dd.
 * Handles: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, and Sheets serial numbers.
 */
export function parseSheetDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmm = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (ddmm) {
    const [, d, m, y] = ddmm;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Sheets serial number (days since 1899-12-30)
  const serial = parseFloat(s);
  if (!isNaN(serial) && serial > 1000) {
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + Math.floor(serial));
    return epoch.toISOString().split('T')[0];
  }

  return null;
}

/** Stable SHA-256 hash for dedup based on normalized registration fields */
export function hashRow(tab: string, parsed: RegistrationRow): string {
  const payload = [
    tab,
    parsed.sNo ?? '',
    (parsed.registrantName || '').toLowerCase().trim(),
    (parsed.regNo || '').toLowerCase().trim(),
    (parsed.mobileNo || '').trim(),
    parsed.registrationDate || '',
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Validate and parse a raw CSV row.
 * Column order (0-indexed):
 *   0=S.No  1=Date  2=Name  3=RegNo  4=Year  5=Dep  6=School
 *   7=Mobile  8=Event_1  9=Event_2  10=Event_3  11=Payment
 */
export function validateRow(
  values: string[],
  tab: '200' | '250'
): { parsed: RegistrationRow; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const name = values[2]?.trim();
  if (!name) errors.push({ field: 'registrant_name', message: 'Name is required' });

  const dateStr = parseSheetDate(values[1]);
  if (!dateStr) errors.push({ field: 'registration_date', message: `Cannot parse date: "${values[1]}"` });

  const sNoRaw = parseInt(values[0]);
  const parsed: RegistrationRow = {
    sNo: isNaN(sNoRaw) ? null : sNoRaw,
    registrationDate: dateStr,
    registrantName: name || '(unknown)',
    regNo: values[3]?.trim() || null,
    year: values[4]?.trim() || null,
    department: values[5]?.trim() || null,
    school: values[6]?.trim() || null,
    mobileNo: values[7]?.trim() || null,
    event1: values[8]?.trim() || null,
    event2: values[9]?.trim() || null,
    event3: values[10]?.trim() || null,
    paymentMethod: values[11]?.trim() || null,
    registrationType: tab === '200' ? 200 : 250,
  };

  return { parsed, errors };
}

/** Fetch the CSV export URL for a specific sheet tab by GID */
async function fetchCsvRows(sheetId: string, gid: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  const response = await withRetry(async () => {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FAC-PYROS-Dashboard/1.0',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Sheet is not public. Go to Google Sheets → Share → "Anyone with the link" → Viewer. (HTTP ${res.status})`
        );
      }
      throw new Error(`HTTP ${res.status} from Sheets export URL`);
    }

    return res;
  });

  const csvText = await response.text();

  // Split into lines, skip header (line 0)
  const lines = csvText.split('\n').filter((l) => l.trim());
  const dataLines = lines.slice(1); // remove header row

  return dataLines.map(parseCsvLine);
}

/** Upsert a validated row — uses source_row_hash for dedup */
async function upsertRow(row: RegistrationRow, hash: string): Promise<'inserted' | 'updated'> {
  const result = await query(
    `INSERT INTO registrations
       (s_no, registration_date, registrant_name, reg_no, year, department, school,
        mobile_no, event_1, event_2, event_3, payment_method, registration_type, source_row_hash, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
     ON CONFLICT (source_row_hash) DO UPDATE SET
       s_no               = EXCLUDED.s_no,
       registration_date  = EXCLUDED.registration_date,
       registrant_name    = EXCLUDED.registrant_name,
       reg_no             = EXCLUDED.reg_no,
       year               = EXCLUDED.year,
       department         = EXCLUDED.department,
       school             = EXCLUDED.school,
       mobile_no          = EXCLUDED.mobile_no,
       event_1            = EXCLUDED.event_1,
       event_2            = EXCLUDED.event_2,
       event_3            = EXCLUDED.event_3,
       payment_method     = EXCLUDED.payment_method,
       synced_at          = now()
     RETURNING (xmax = 0) as is_insert`,
    [
      row.sNo, row.registrationDate, row.registrantName, row.regNo,
      row.year, row.department, row.school, row.mobileNo,
      row.event1, row.event2, row.event3, row.paymentMethod,
      row.registrationType, hash,
    ]
  );
  return result.rows[0]?.is_insert ? 'inserted' : 'updated';
}

/** Flag a bad row in sync_errors */
async function flagSyncError(
  tab: string, rowNumber: number, rawValues: string[], errors: ValidationError[]
): Promise<void> {
  await query(
    `INSERT INTO sync_errors (sheet_tab, row_number, raw_row, errors)
     VALUES ($1, $2, $3, $4)`,
    [tab, rowNumber, JSON.stringify(rawValues), errors.map((e) => `${e.field}: ${e.message}`).join('; ')]
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────

/**
 * Perform a full sync from the public Google Sheet CSV exports.
 * Reads GOOGLE_SHEET_GID_200 and GOOGLE_SHEET_GID_250 from config/env.
 *
 * To find your GIDs: open your Sheet, click a tab — the URL shows ?gid=XXXXXXXX
 */
export async function performSync(): Promise<SyncResult> {
  const sheetId = config.googleSheetId;
  if (!sheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in your .env file');
  }

  // GIDs for each tab (default: 0 for first tab, 1 for second — override in .env)
  const gid200 = process.env.GOOGLE_SHEET_GID_200 || '0';
  const gid250 = process.env.GOOGLE_SHEET_GID_250 || '1';

  const tabs: Array<{ tab: '200' | '250'; gid: string }> = [
    { tab: '200', gid: gid200 },
    { tab: '250', gid: gid250 },
  ];

  const result: SyncResult = {
    rowsProcessed: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsFailed: 0,
    errors: [],
  };

  for (const { tab, gid } of tabs) {
    console.log(`[sync] Fetching tab "${tab}" (gid=${gid})…`);
    let rows: string[][];

    try {
      rows = await fetchCsvRows(sheetId, gid);
    } catch (err: any) {
      console.error(`[sync] Failed to fetch tab "${tab}":`, err.message);
      result.errors.push({ tab, rowNumber: -1, errors: err.message });
      result.rowsFailed++;
      continue;
    }

    console.log(`[sync] Tab "${tab}": ${rows.length} data rows fetched`);

    for (let i = 0; i < rows.length; i++) {
      const rawValues = rows[i];
      const rowNumber = i + 2; // +1 for header, +1 for 1-based

      // Skip blank rows or rows where main registration columns (0-11) are empty
      const mainCols = rawValues.slice(0, 12);
      if (!rawValues || mainCols.every((v) => !v?.trim())) continue;

      result.rowsProcessed++;
      const { parsed, errors: valErrors } = validateRow(rawValues, tab);

      const criticalErrors = valErrors.filter(
        (e) => e.field === 'registrant_name' || e.field === 'registration_date'
      );

      if (criticalErrors.length > 0) {
        await flagSyncError(tab, rowNumber, rawValues, valErrors);
        result.rowsFailed++;
        result.errors.push({ tab, rowNumber, errors: criticalErrors.map((e) => e.message).join('; ') });
        continue;
      }

      const hash = hashRow(tab, parsed);

      try {
        const action = await upsertRow(parsed, hash);
        if (action === 'inserted') result.rowsInserted++;
        else result.rowsUpdated++;
      } catch (err: any) {
        await flagSyncError(tab, rowNumber, rawValues, [{ field: 'db', message: err.message }]);
        result.rowsFailed++;
        result.errors.push({ tab, rowNumber, errors: `DB error: ${err.message}` });
      }
    }
  }

  console.log(
    `[sync] Complete — processed: ${result.rowsProcessed}, ` +
    `inserted: ${result.rowsInserted}, updated: ${result.rowsUpdated}, failed: ${result.rowsFailed}`
  );
  return result;
}
