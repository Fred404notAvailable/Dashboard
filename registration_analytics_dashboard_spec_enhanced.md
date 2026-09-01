# Registration Analytics Dashboard — Enhanced Technical Specification

| | |
|---|---|
| **Document Version** | 2.0 (Enhanced) — derived from `Registration_Analytics_Dashboard_Spec.md` v1.0 |
| **Source Data** | Google Sheets (Registration Data) |
| **Target Architecture** | Node.js, TypeScript, Vite (React or Vue) |
| **Primary Audience** | Full-stack developers and AI-assisted build agents (e.g., Google Antigravity, Cursor, Claude Code) implementing the system |
| **Secondary Audience** | Non-technical stakeholders (event administrators, registration desk staff) who will use the finished dashboard |
| **Status** | Ready for implementation planning |

---

## Document Changelog & Enhancement Notes

This version expands the original one-page specification into a full implementation blueprint. Nothing from the original document has been removed or altered — every original section is preserved verbatim inside a **"> Original Specification"** blockquote, immediately followed by an **"Enhanced Detail"** subsection with added depth. New sections that did not exist in v1.0 are marked **(New)** in the Table of Contents.

**What was added:**
- A system architecture diagram and data-flow/sequence diagrams (Mermaid)
- Working TypeScript/SQL code samples for every major subsystem
- A proposed relational database schema (the original spec named PostgreSQL but never defined tables)
- A REST API endpoint reference (the original spec implied a backend but specified no contract)
- A non-technical-user UX section (the original *prompt* asked for a UI "suitable for non-technical users," but the generated spec never translated that into concrete guidance)
- Testing strategy, deployment/DevOps guidance, environment variable reference, and a troubleshooting table
- A phased, verifiable implementation roadmap
- A glossary and curated external resources list
- An explicit **Ambiguities & Assumptions** section for anything the original spec left underspecified

**What was intentionally left unchanged:** all technology choices, feature scope, and wording of the original spec. Where the original was ambiguous, this document adds a clearly labeled interpretation rather than silently rewriting it.

---

## Table of Contents

1. [How to Use This Document](#0-how-to-use-this-document)
2. [Executive Summary](#1-executive-summary)
3. [Prerequisites & Glossary](#2-prerequisites--glossary) *(New)*
4. [System Architecture Overview](#3-system-architecture-overview) *(New)*
5. [Technical Stack Definition](#4-technical-stack-definition)
6. [Core Modules & Features](#5-core-modules--features)
   - [5.1 Data Integration and Synchronization](#51-data-integration-and-synchronization)
   - [5.2 Daily Registration Report Generation](#52-daily-registration-report-generation)
   - [5.3 Date Range Reporting & Filtering](#53-date-range-reporting--filtering)
   - [5.4 Interactive Data Visualization](#54-interactive-data-visualization)
   - [5.5 Predictive & Advanced Analytics](#55-predictive--advanced-analytics-optional-expansion)
   - [5.6 Data Export Capabilities](#56-data-export-capabilities)
   - [5.7 Security and Access Control](#57-security-and-access-control)
   - [5.8 Performance and Scalability](#58-performance-and-scalability)
7. [Non-Technical User UX Guidelines](#6-non-technical-user-ux-guidelines) *(New)*
8. [Proposed Database Schema](#7-proposed-database-schema) *(New)*
9. [API Endpoint Reference](#8-api-endpoint-reference) *(New)*
10. [Environment Variables & Configuration](#9-environment-variables--configuration) *(New)*
11. [Testing Strategy](#10-testing-strategy) *(New)*
12. [Deployment & DevOps](#11-deployment--devops) *(New)*
13. [Implementation Roadmap](#12-implementation-roadmap-phased) *(New)*
14. [Troubleshooting & Common Pitfalls](#13-troubleshooting--common-pitfalls) *(New)*
15. [Ambiguities & Assumptions](#14-ambiguities--assumptions) *(New)*
16. [External Resources & Further Reading](#15-external-resources--further-reading) *(New)*
17. [Appendix: Original Specification (Verbatim)](#16-appendix-original-specification-verbatim)

---

## 0. How to Use This Document

This file is designed to be handed directly to an AI coding agent (Google Antigravity, Claude Code, or similar) or to a human engineering team as a build blueprint. A few practical notes on using it that way:

1. **Feed it in whole, not piecemeal.** Agentic builders scaffold better when they can see the database schema, API contract, and feature list together — splitting this into multiple prompts tends to produce mismatched assumptions between frontend and backend.
2. **Treat Section 7 (Database Schema) and Section 8 (API Reference) as the contract.** If the agent proposes a different schema, reconcile it against these tables before continuing, since every other module (reports, charts, exports) depends on this shape.
3. **Use Section 12 (Roadmap) as your prompt sequence.** Each phase ends with a verification checklist — confirm those checks pass before moving to the next phase, whether you're driving the build yourself or reviewing an agent's output.
4. **Section 14 (Ambiguities) must be resolved with your actual stakeholders**, not guessed by the builder — particularly the meaning of registration types `200`/`250`, since that assumption ripples into the database schema, PDF report layout, and chart legends.

---

## 1. Executive Summary

> **Original Specification:**
> This document outlines the technical specifications and feature requirements for a full-stack web application designed to ingest, process, visualize, and report on registration data from a specified Google Sheet. This specification is optimized for automated generation and rapid development.

### Enhanced Detail

The system being specified is, in effect, a **lightweight ETL (Extract, Transform, Load) pipeline wrapped in an analytics front end**: it extracts rows from a live Google Sheet, transforms and validates them into a normalized store, and loads them into a queryable database that powers reports, charts, and exports. Understanding it through that lens clarifies why several components exist that a simple "read a spreadsheet and show a chart" app wouldn't need — the caching layer, the validation middleware, and the audit log all exist because the *source of truth is a spreadsheet a human can edit at any time*, which is a fundamentally less reliable data source than a form-driven database.

**Primary use case:** an event or program (registration data, likely fee-based, given the `200`/`250` categorization — see [Section 14](#14-ambiguities--assumptions)) that collects registrations into a Google Sheet, and needs daily/period reporting without manually exporting and formatting the sheet by hand.

**Non-goals** (explicitly out of scope unless requirements change):
- Writing data *back* to the Google Sheet (the spec only describes reading/ingesting data)
- Real-time collaborative editing of registration records within the dashboard
- Payment processing (the system reports on payment *type*, it does not process payments)

---

## 2. Prerequisites & Glossary

This section did not exist in the original spec. It is included because the document mixes concepts that assume different levels of background — some readers will know OAuth 2.0 cold, others will not.

### Prerequisite knowledge

| Area | What you should know before implementing |
|---|---|
| **Backend** | Node.js fundamentals, async/await, REST API design, basic SQL |
| **Frontend** | React or Vue component model, state management basics, TypeScript types |
| **Cloud** | How to create a Google Cloud project and a service account |
| **Data** | Difference between OLTP (transactional) and read-heavy analytics workloads |
| **DevOps** | Environment variables, basic Docker, HTTPS/TLS concepts |

### Glossary

| Term | Definition |
|---|---|
| **OAuth 2.0** | An authorization framework that lets an application access a resource (like a Google Sheet) on behalf of a user or service, without handling raw passwords. |
| **Service Account** | A special Google Cloud identity used by *server-to-server* automation (not tied to a human login) — the correct choice here since the sync runs unattended. |
| **Rate Limiting** | A cap a server-side API (like Google Sheets API) imposes on how many requests you can make per minute/day, returned as an HTTP `429` status when exceeded. |
| **Exponential Backoff** | A retry strategy where each failed attempt waits progressively longer (e.g., 1s, 2s, 4s, 8s…) before retrying, reducing pressure on a rate-limited API. |
| **RBAC** | Role-Based Access Control — restricting features/data by a user's assigned role (Admin, Analyst, Viewer here) rather than per-user rules. |
| **JWT** | JSON Web Token — a signed, compact token used to represent an authenticated session without server-side session storage. |
| **CRON** | A time-based job scheduler syntax (`minute hour day month weekday`) used to trigger recurring tasks like nightly report generation. |
| **ETL** | Extract, Transform, Load — the standard pattern for moving data from a source system into an analytics-ready store. |
| **TTL (cache)** | Time To Live — how long a cached value (e.g., in Redis) is considered valid before it must be refreshed from the source. |
| **Drill-down** | A visualization interaction where clicking a chart segment filters the rest of the dashboard to that segment's underlying data. |
| **WYSIWYG export** | "What You See Is What You Get" — an export (e.g., PDF) that visually matches what's on screen, as opposed to a raw data dump. |

---

## 3. System Architecture Overview

*(New — the original spec listed technologies but never showed how they connect.)*

```mermaid
flowchart LR
    GS[("Google Sheets\n(source of truth)")] -->|Sheets API v4\nOAuth2 Service Account| SYNC["Sync Service\n(CRON + on-demand webhook)"]
    SYNC --> VAL["Validation &\nTransform Layer"]
    VAL -->|clean rows| PG[("PostgreSQL\nregistrations DB")]
    VAL -->|flagged rows| ERR[("Error/Anomaly\nLog Table")]
    PG --> API["Backend API\n(Node.js + Express/Fastify, TS)"]
    RED[("Redis\ncache + rate-limit state")] <--> API
    API --> FE["Frontend SPA\n(Vite + React/Vue, TS)"]
    API --> PDF["Report Engine\n(PDFKit/Puppeteer)"]
    API --> XLS["Export Engine\n(ExcelJS + fast-csv)"]
    API --> AUTH["Auth/RBAC\nMiddleware (JWT)"]
    API --> AUDIT[("Audit Log Table")]
    PDF --> MAIL["Email Delivery\n(SMTP/SendGrid)"]
```

**Read path (dashboard views, charts):** Frontend → Backend API → Redis (cache hit) or PostgreSQL (cache miss, then populate Redis) → JSON response → chart render.

**Write/ingestion path (sync job):** CRON or manual trigger → Sheets API (with retry/backoff) → Validation layer → PostgreSQL insert/upsert → cache invalidation for affected date ranges.

**Report path:** User selects date range → API aggregates from PostgreSQL → Report Engine renders PDF/XLSX/CSV → either streamed to the browser or dispatched by email, per [Section 5.2](#52-daily-registration-report-generation).

---

## 4. Technical Stack Definition

> **Original Specification:**
> * **Frontend Environment:** Vite-powered Single Page Application (React or Vue) using TypeScript.
> * **Backend API:** Node.js with Express or Fastify (TypeScript).
> * **Data Integration:** Google Sheets API v4 (via `googleapis` Node client).
> * **Data Processing & Caching:** Redis (for rate-limit mitigation and caching) and an intermediate PostgreSQL database for handling 100k+ row scalability.
> * **Visualization:** Recharts, Chart.js, or D3.js.
> * **Document Generation:** Puppeteer or PDFKit (for PDF), ExcelJS (for XLSX), and fast-csv (for CSV).

### Enhanced Detail: choosing between the listed options

The original spec correctly lists valid alternatives but doesn't guide the choice between them. Here's a practical comparison to make that decision once, early, so the rest of the build is consistent.

| Decision | Option A | Option B | Recommendation & rationale |
|---|---|---|---|
| Frontend framework | **React** | Vue | React if the team/agent has more familiarity with it and you want the largest ecosystem of chart/date-picker libraries (Recharts, react-datepicker); Vue if you prefer a gentler learning curve for non-technical contributors extending the UI later. Either satisfies the spec. |
| Backend framework | Express | **Fastify** | Fastify has materially better raw throughput and built-in JSON schema validation, which pairs well with the 100k-row performance target in [Section 5.8](#58-performance-and-scalability). Express remains fine if ecosystem familiarity outweighs the performance gain. |
| Chart library | Recharts | Chart.js | D3.js |
| | Best if using React and you want composable, declarative charts | Best for lower bundle size and simpler imperative charts | Best only if you need fully custom visualizations beyond the four chart types specified — otherwise it's more complexity than this project needs |
| PDF engine | **PDFKit** | Puppeteer |
| | Lightweight, fast, no headless browser dependency — ideal for a template-driven "Daily Registration Report" with fixed layout | Renders actual HTML/CSS to PDF (pixel-perfect WYSIWYG dashboard export) but is heavier (ships a Chromium binary) and slower under concurrent load | Use PDFKit for the scheduled daily report (Section 5.2); reserve Puppeteer only if you also need "export the dashboard exactly as shown" (Section 5.6's WYSIWYG requirement) |

### Version compatibility notes

- `googleapis` (Node client): pin to a version supporting **Sheets API v4** and Node ≥ 18. Google deprecates client library majors periodically — check `npm view googleapis versions` before locking a version.
- **PostgreSQL 14+** recommended for native support of `MERGE`-like upsert patterns (`INSERT ... ON CONFLICT DO UPDATE`), which the sync job will rely on heavily.
- **Redis 6+** for ACL-based access control if you later need to restrict which services can flush the cache.
- **Vite 5+** for Node 18+ compatibility; confirm your deployment target's Node version before scaffolding.

### Common pitfalls at the stack-selection stage

- Picking Puppeteer for *every* PDF (including the scheduled daily report) will slow down and destabilize CRON jobs under concurrent generation — reserve it for on-demand WYSIWYG exports only.
- Forgetting to pin `googleapis` and Node versions leads to silent breaking changes when Google deprecates an API client major version.

---

## 5. Core Modules & Features

### 5.1 Data Integration and Synchronization

> **Original Specification:**
> * **Authentication:** Service Account via OAuth 2.0. Credentials stored securely in backend environment variables.
> * **Ingestion Engine:**
>     * Configurable CRON jobs for hourly/daily syncs.
>     * Manual Webhook/Trigger for on-demand sync.
>     * Intelligent retry logic with exponential backoff for Google API rate limits (HTTP 429).
> * **Validation Layer:** Middleware to sanitize raw sheet data. Flags null values, malformed timestamps, and invalid payment types before inserting into the analytics pipeline.

#### Enhanced Detail

**Step-by-step: setting up the service account (do this once, before writing any sync code)**

1. In Google Cloud Console, create or select a project, then enable the **Google Sheets API** under "APIs & Services."
2. Create a **Service Account** (IAM & Admin → Service Accounts), and generate a JSON key — this file is downloaded once and cannot be re-downloaded, so store it immediately in your secrets manager.
3. Open the target Google Sheet and **share it** with the service account's email address (looks like `sync-bot@your-project.iam.gserviceaccount.com`), granting **Viewer** access — write access is unnecessary since this system only reads.
4. Verify: a test script (below) should successfully read a range without a `403 Permission denied` error. If you get a 403, the sheet-sharing step (3) was skipped or the wrong email was used — this is the most common setup mistake.

```typescript
// sheetsClient.ts
import { google } from 'googleapis';

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, // e.g. ./secrets/service-account.json
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

export const sheets = google.sheets({ version: 'v4', auth });

export async function fetchRegistrationRows(spreadsheetId: string, range: string) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values ?? []; // array of arrays; row[0] is the header row if range includes it
}
```

**Retry logic with exponential backoff** (the original spec names this requirement but doesn't show the pattern):

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.code ?? err?.response?.status;
      const isRateLimited = status === 429;
      const isTransient = status >= 500 && status < 600;
      attempt++;
      if ((!isRateLimited && !isTransient) || attempt > maxRetries) throw err;
      const delayMs = Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 250; // jitter avoids thundering herd
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// usage
const rows = await withRetry(() => fetchRegistrationRows(SHEET_ID, 'Registrations!A2:K'));
```

**Validation layer** — expanding "flags null values, malformed timestamps, and invalid payment types":

```typescript
interface RawRegistrationRow {
  name?: string;
  registrationType?: string; // expect '200' | '250'
  paymentType?: string;
  registrationDate?: string;
}

interface ValidationResult { valid: boolean; errors: string[] }

const VALID_PAYMENT_TYPES = ['Cash', 'UPI', 'Card', 'Bank Transfer'] as const;

function validateRow(row: RawRegistrationRow): ValidationResult {
  const errors: string[] = [];
  if (!row.name?.trim()) errors.push('Missing registrant name');
  if (!['200', '250'].includes(String(row.registrationType).trim())) {
    errors.push(`Unrecognized registration type: "${row.registrationType}"`);
  }
  if (!VALID_PAYMENT_TYPES.includes(row.paymentType as any)) {
    errors.push(`Unrecognized payment type: "${row.paymentType}"`);
  }
  if (!row.registrationDate || isNaN(Date.parse(row.registrationDate))) {
    errors.push(`Malformed date: "${row.registrationDate}"`);
  }
  return { valid: errors.length === 0, errors };
}
```

Rows that fail validation should be **inserted into a separate `sync_errors` table** (see [Section 7](#7-proposed-database-schema)) rather than silently dropped — this gives administrators a place to see and fix bad sheet entries, satisfying the "flags" requirement in a way that's actually actionable rather than just logged to a console.

**Edge cases to handle explicitly:**
- **Header row changes:** if a column is inserted/reordered in the sheet, a position-based parser silently misreads data. Parse by **header name**, not column index — read row 1, build a `{columnName: index}` map, then look up fields by name each sync.
- **Merged cells / blank rows:** the Sheets API returns `undefined` for merged/empty cells within a row array — always default with `?? ''` rather than assuming an index exists.
- **Duplicate rows** (e.g., an admin accidentally re-enters a registrant): use an `ON CONFLICT` upsert keyed on a stable identifier (e.g., a source row hash of name + date + type) rather than plain `INSERT`.
- **Sheet renamed or range changed:** store `spreadsheetId` and `range` as configuration, not hardcoded constants, so this doesn't require a redeploy to fix.

**Sync frequency trade-offs** (expanding "configurable data refresh intervals" from the original *prompt*, which the generated spec addressed only as CRON):

| Mode | Best for | Cost/risk |
|---|---|---|
| Manual only | Low-volume events, admin triggers sync before checking reports | Data can go stale if forgotten |
| Hourly CRON | Most events — balances freshness with API quota usage | Up to 1 hour of staleness |
| Real-time (near-) | High-volume registration days (e.g., event day itself) | Requires either aggressive polling (quota risk) or a Google Apps Script `onEdit` trigger that calls your webhook — the latter is the more efficient real-time approach and should be considered even though the original spec only names "real-time" without a mechanism |

---

### 5.2 Daily Registration Report Generation

> **Original Specification:**
> * **PDF Engine:** High-fidelity PDF generation triggered via backend route.
> * **Content Specifications:**
>     * **Registration Types:** strict categorization and conditional logic to isolate Type `200` vs. Type `250`.
>     * **Financials:** Payment type breakdown.
>     * **Layout:** Professional headers, dynamic timestamps, page pagination, and parameterized branding.
> * **Delivery:** Scheduled email dispatch via SMTP/SendGrid or immediate client-side blob download. Dynamic filename generation (e.g., `Registration_Report_YYYYMMDD_Subtitle.pdf`).

#### Enhanced Detail

```typescript
// reportEngine.ts
import PDFDocument from 'pdfkit';
import fs from 'fs';

interface DailyReportData {
  date: string;
  total: number;
  type200: number;
  type250: number;
  paymentBreakdown: Record<string, number>;
  title?: string;
  subtitle?: string;
}

export function generateDailyReport(data: DailyReportData, outputPath: string) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(fs.createWriteStream(outputPath));

  // Header / branding
  doc.fontSize(18).text(data.title ?? 'Daily Registration Report', { align: 'center' });
  if (data.subtitle) doc.fontSize(12).fillColor('gray').text(data.subtitle, { align: 'center' });
  doc.fontSize(9).fillColor('gray').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(1.5).fillColor('black');

  // Body
  doc.fontSize(12).text(`Report Date: ${data.date}`);
  doc.text(`Total Registrations: ${data.total}`);
  doc.text(`Type 200: ${data.type200}   |   Type 250: ${data.type250}`);
  doc.moveDown();
  doc.text('Payment Type Breakdown:');
  Object.entries(data.paymentBreakdown).forEach(([type, count]) => {
    doc.text(`  • ${type}: ${count}`);
  });

  // Footer with page numbers (must be added after content is laid out)
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('gray').text(`Page ${i + 1} of ${pages.count}`, 50, doc.page.height - 40, { align: 'center' });
  }

  doc.end();
}
```

**Filename generation:**
```typescript
function buildReportFilename(date: string, subtitle?: string): string {
  const slug = subtitle ? `_${subtitle.replace(/\s+/g, '_')}` : '';
  return `Registration_Report_${date.replace(/-/g, '')}${slug}.pdf`;
}
```

**Scheduling + email dispatch:**
```typescript
import cron from 'node-cron';
import nodemailer from 'nodemailer';

cron.schedule('55 23 * * *', async () => { // runs 23:55 daily, server timezone
  const data = await computeDailySummary(new Date());
  const filePath = `/tmp/${buildReportFilename(data.date)}`;
  generateDailyReport(data, filePath);
  await sendReportEmail(filePath, data.date);
}, { timezone: 'Asia/Kolkata' }); // set explicitly — do not rely on server default
```

> **Timezone note:** always pass an explicit `timezone` to `node-cron` (and store all dates in the DB as UTC, converting only at display time). A server deployed in a different region than the event will otherwise generate the "daily" report at the wrong local time.

**Isolating Type 200 vs. Type 250** — the spec asks for "strict categorization." Implement this as a database-level `CHECK` constraint (see [Section 7](#7-proposed-database-schema)), not just application logic, so a bad sync can't silently insert a `300`:

```sql
ALTER TABLE registrations
  ADD CONSTRAINT chk_registration_type CHECK (registration_type IN (200, 250));
```

**Definition of Done for this module:**
- [ ] A report for an arbitrary past date can be regenerated on demand and matches what was emailed that day
- [ ] Page numbers appear correctly on a report spanning >1 page
- [ ] Report generation for a 1,000+ row day completes in under ~3 seconds (informs whether PDFKit is fast enough or batching is needed)
- [ ] Failed email dispatch is retried or logged to the audit table, not silently dropped

---

### 5.3 Date Range Reporting & Filtering

> **Original Specification:**
> * **UI Components:** Interactive DatePicker (support for single, range, and multi-day).
> * **Presets:** Quick-select buttons mapping to ISO date ranges: Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Last Month, This Quarter, YTD.
> * **Aggregation Metrics:** Total volume, delta from previous period, categorical breakdowns.

#### Enhanced Detail

**Preset date range logic** (pure function, easily unit-tested):

```typescript
import { startOfMonth, endOfMonth, startOfQuarter, subDays, subMonths, startOfYear, formatISO } from 'date-fns';

type Preset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'ytd';

function resolvePreset(preset: Preset, now = new Date()): { start: string; end: string } {
  switch (preset) {
    case 'today': return { start: formatISO(now, { representation: 'date' }), end: formatISO(now, { representation: 'date' }) };
    case 'yesterday': { const d = subDays(now, 1); return { start: formatISO(d, { representation: 'date' }), end: formatISO(d, { representation: 'date' }) }; }
    case 'last7': return { start: formatISO(subDays(now, 6), { representation: 'date' }), end: formatISO(now, { representation: 'date' }) };
    case 'last30': return { start: formatISO(subDays(now, 29), { representation: 'date' }), end: formatISO(now, { representation: 'date' }) };
    case 'thisMonth': return { start: formatISO(startOfMonth(now), { representation: 'date' }), end: formatISO(now, { representation: 'date' }) };
    case 'lastMonth': { const lm = subMonths(now, 1); return { start: formatISO(startOfMonth(lm), { representation: 'date' }), end: formatISO(endOfMonth(lm), { representation: 'date' }) }; }
    case 'thisQuarter': return { start: formatISO(startOfQuarter(now), { representation: 'date' }), end: formatISO(now, { representation: 'date' }) };
    case 'ytd': return { start: formatISO(startOfYear(now), { representation: 'date' }), end: formatISO(now, { representation: 'date' }) };
  }
}
```

**Delta from previous period** — the original spec lists this as a metric but doesn't define "previous period." Recommended definition: a period of equal length immediately preceding the selected range (e.g., selecting Aug 1–15 compares against Jul 17–31, not Jul 1–15), so the comparison is always like-for-like in duration:

```typescript
function previousPeriod(start: string, end: string) {
  const days = daysBetween(start, end) + 1;
  return { start: subDays(new Date(start), days), end: subDays(new Date(start), 1) };
}
```

**Aggregation query** (server-side, per [Section 5.8](#58-performance-and-scalability)'s requirement to avoid client-side aggregation):

```sql
SELECT
  registration_type,
  payment_type,
  COUNT(*) AS count
FROM registrations
WHERE registration_date BETWEEN $1 AND $2
GROUP BY registration_type, payment_type;
```

**UX note:** show the applied date range as a persistent, dismissible chip/badge near the top of the dashboard (the original spec calls for "clear visual indicators of the applied filters") — this is a common gap in dashboards where users lose track of whether they're looking at "today" or a stale filtered view.

---

### 5.4 Interactive Data Visualization

> **Original Specification:**
> * **Visual Hierarchy:**
>     * *Time-Series Analysis:* Line/Area charts showing daily registration volume trends.
>     * *Categorical Distribution:* Donut charts for Registration Type (200 vs 250).
>     * *Financial Distribution:* Stacked bar charts for Payment Type.
>     * *Growth Tracking:* Cumulative step/line charts for total registrations over time.
> * **UX/UI:** Fully responsive SVG/Canvas rendering. Hover states with precise tooltip metrics. Drill-down capabilities clicking into specific chart segments to filter the global dashboard state.

#### Enhanced Detail

| Chart | Data shape needed | Recharts component | Notes |
|---|---|---|---|
| Daily volume trend | `[{date, count}]` | `<AreaChart>` / `<LineChart>` | Use `<Brush>` for zoom on long ranges (30+ days) |
| Registration type (200 vs 250) | `[{type, count}]` | `<PieChart>` with `innerRadius` for donut | Fix color mapping (e.g., 200 = blue, 250 = amber) globally so it's consistent across every chart on the dashboard |
| Payment type breakdown | `[{date, cash, upi, card, bankTransfer}]` | `<BarChart>` stacked | Percent-mode toggle (counts vs. %) improves comparability across days with different volumes |
| Cumulative total | `[{date, cumulativeCount}]` | `<LineChart>` (precomputed running sum) | Compute the running sum server-side, not in the browser, to keep this correct after filtering |

**Drill-down pattern:**

```tsx
function handleSegmentClick(registrationType: '200' | '250') {
  setGlobalFilter((prev) => ({ ...prev, registrationType }));
  // triggers a re-fetch of every chart + the data table bound to globalFilter
}
```

Treat the clicked filter as **global dashboard state** (e.g., React Context or a small Zustand store), not local chart state — otherwise "drill-down" only affects the one chart clicked, not the whole dashboard, which is what the original spec's wording implies ("filter the global dashboard state").

**Accessibility (not in the original spec, but implied by "suitable for non-technical users"):**
- Every chart needs a text-equivalent summary (`aria-label` or an adjacent data table) for screen reader users and for users who simply find charts harder to parse than numbers.
- Don't rely on color alone to distinguish Type 200 vs. 250 — add a pattern/label difference too (WCAG 1.4.1).

**Responsive behavior:** wrap each chart in a `<ResponsiveContainer>` (Recharts) with a defined aspect ratio; on viewports under ~480px, stack charts vertically and switch legends to below-chart rather than side-by-side to avoid squeezing the plot area.

---

### 5.5 Predictive & Advanced Analytics (Optional Expansion)

> **Original Specification:**
> * **Forecasting Hook:** API endpoints structured to easily integrate predictive modeling scripts (e.g., Python microservice) to forecast future registration volumes based on historical ingestion rates.

#### Enhanced Detail

Since this is explicitly optional in the original spec, treat it as a **Phase 6+** item (see [roadmap](#12-implementation-roadmap-phased)) rather than core scope. If pursued:

- **Simple baseline (no Python needed):** a moving-average or linear-regression forecast can be computed directly in Node with a small library (e.g., `simple-statistics`), which avoids standing up a separate microservice for a first version.
- **Advanced (Python microservice):** for genuine seasonality-aware forecasting, a `Prophet`-based FastAPI microservice is the standard pattern. The Node backend would call it like any other internal service:

```typescript
interface ForecastResponse { date: string; predicted: number; lower: number; upper: number }

async function getForecast(days = 14): Promise<ForecastResponse[]> {
  const res = await fetch(`${process.env.FORECAST_SERVICE_URL}/forecast?days=${days}`);
  return res.json();
}
```

Design the API contract (`GET /forecast?days=N` returning `{date, predicted, lower, upper}[]`) now even if you don't build the microservice yet — this is what "structured to easily integrate" means in practice: an endpoint shape the frontend can already render a chart against, with the model behind it swappable later.

---

### 5.6 Data Export Capabilities

> **Original Specification:**
> * **PDF:** Formatted WYSIWYG exports of the current dashboard view.
> * **Excel (XLSX):** Multi-sheet workbooks. Sheet 1: Summary Stats. Sheet 2: Raw filtered data. Applies native Excel table formatting.
> * **CSV:** Fast, unformatted data dump of the current query state.

#### Enhanced Detail

```typescript
// excelExport.ts
import ExcelJS from 'exceljs';

export async function exportToExcel(
  summaryRows: { metric: string; value: string | number }[],
  rawRows: Record<string, unknown>[],
  outPath: string
) {
  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 },
  ];
  summarySheet.addRows(summaryRows);
  summarySheet.getRow(1).font = { bold: true };

  const dataSheet = workbook.addWorksheet('Raw Data');
  if (rawRows.length) {
    dataSheet.columns = Object.keys(rawRows[0]).map((key) => ({ header: key, key, width: 18 }));
    dataSheet.addRows(rawRows);
    dataSheet.getRow(1).font = { bold: true };
    dataSheet.autoFilter = { from: 'A1', to: { row: 1, column: dataSheet.columns.length } };
  }

  await workbook.xlsx.writeFile(outPath);
}
```

**CSV streaming for large datasets** (important once the dataset approaches the 100,000-row target — buffering the entire export in memory risks OOM crashes on constrained hosting):

```typescript
import { format } from 'fast-csv';
import { pipeline } from 'stream/promises';
import fs from 'fs';

async function streamCsvExport(rowsAsyncIterable: AsyncIterable<Record<string, unknown>>, outPath: string) {
  const csvStream = format({ headers: true });
  const writeStream = fs.createWriteStream(outPath);
  const pipe = pipeline(csvStream, writeStream);
  for await (const row of rowsAsyncIterable) csvStream.write(row);
  csvStream.end();
  await pipe;
}
```

**Preserving filters/formatting on export:** the exported filename and an embedded metadata row (e.g., "Filtered: 2026-08-01 to 2026-08-25, Type: All") should reflect the exact query state used to generate it — this closes the loop on the original requirement to "preserve applied filters during export operations," which otherwise tends to be forgotten once export code is written independently of the filter UI.

---

### 5.7 Security and Access Control

> **Original Specification:**
> * **Authentication:** JWT-based session management.
> * **RBAC (Role-Based Access Control):**
>     * *Admin:* Full system config, manual sync triggers, user management.
>     * *Analyst:* View dashboards, create custom date queries, export raw data.
>     * *Viewer:* View-only access to pre-generated daily reports.
> * **Audit Logging:** Middleware tracking `userId`, `action_type`, and `timestamp` for all export and config changes.

#### Enhanced Detail

**Permission matrix** (making the three roles concrete and enforceable):

| Capability | Admin | Analyst | Viewer |
|---|:---:|:---:|:---:|
| View dashboards & charts | ✅ | ✅ | ✅ |
| View pre-generated daily reports | ✅ | ✅ | ✅ |
| Create custom date-range queries | ✅ | ✅ | ❌ |
| Export raw data (CSV/XLSX) | ✅ | ✅ | ❌ |
| Trigger manual sheet sync | ✅ | ❌ | ❌ |
| Manage users / roles | ✅ | ❌ | ❌ |
| View audit log | ✅ | ❌ | ❌ |
| Edit report branding/templates | ✅ | ❌ | ❌ |

**Middleware implementation:**

```typescript
type Role = 'admin' | 'analyst' | 'viewer';

function requireRole(...allowed: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

router.post('/api/sync/trigger', requireRole('admin'), triggerSyncHandler);
router.get('/api/export/csv', requireRole('admin', 'analyst'), exportCsvHandler);
router.get('/api/reports/daily/:date', requireRole('admin', 'analyst', 'viewer'), getDailyReportHandler);
```

**JWT session flow:**

```mermaid
sequenceDiagram
  participant U as User
  participant FE as Frontend
  participant API as Backend API
  U->>FE: Enter credentials
  FE->>API: POST /api/auth/login
  API-->>FE: JWT (short-lived) + refresh token (httpOnly cookie)
  FE->>API: Subsequent requests with Authorization: Bearer <JWT>
  API-->>FE: 401 if expired
  FE->>API: POST /api/auth/refresh (uses httpOnly cookie)
  API-->>FE: New JWT
```

Store the **refresh token in an `httpOnly`, `Secure`, `SameSite=Strict` cookie** — never in `localStorage`, which is readable by any injected script (XSS) and defeats the purpose of a short-lived access token.

**Audit log** — beyond the fields the spec names, also capture the **request's affected resource** so logs are actually useful during an incident review:

```typescript
interface AuditLogEntry {
  userId: string;
  actionType: 'export' | 'sync_trigger' | 'config_change' | 'login' | 'role_change';
  resource?: string; // e.g., "date_range:2026-08-01..2026-08-15" or "user:jane@example.com"
  metadata?: Record<string, unknown>;
  timestamp: Date;
}
```

**Transport security:** enforce HTTPS at the load balancer/reverse proxy (redirect all HTTP → HTTPS), set `Strict-Transport-Security` headers, and confirm the service-account JSON key file is **never** committed to version control (add it to `.gitignore` and load it from a secrets manager in production rather than a file path).

---

### 5.8 Performance and Scalability

> **Original Specification:**
> * **Data Handling:** Implementation of cursor-based or offset pagination for data tables.
> * **Optimization:** API responses payload minimization. Aggregations calculated server-side or at the database level rather than client-side to easily support the 100,000+ row threshold.

#### Enhanced Detail

**Offset vs. cursor pagination — when to use which:**

| | Offset (`LIMIT/OFFSET`) | Cursor (keyset) |
|---|---|---|
| Simplicity | Simple, supports "jump to page 5" | Slightly more complex, no arbitrary page jump |
| Performance at scale | Degrades on large offsets (DB still scans skipped rows) | Consistently fast regardless of position — **recommended once past ~10,000 rows** |
| Best for | Small/admin tables, low page counts | The main registrations data table given the 100k-row target |

```sql
-- Cursor-based pagination, ordered by (registration_date, id) for a stable cursor
SELECT id, registrant_name, registration_type, registration_date
FROM registrations
WHERE (registration_date, id) > ($1, $2) -- cursor from last row of previous page
ORDER BY registration_date, id
LIMIT 50;
```

**Caching strategy (Redis):**
- Cache aggregation results keyed by `(dateRange, filters)`, e.g. `agg:2026-08-01:2026-08-15:all` — TTL of 5–15 minutes balances freshness against sync frequency.
- **Invalidate proactively** on sync completion for the specific date(s) touched, rather than relying on TTL expiry alone — this avoids showing stale numbers right after a sync.

```typescript
async function getCachedAggregation(key: string, computeFn: () => Promise<unknown>, ttlSeconds = 600) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const fresh = await computeFn();
  await redis.set(key, JSON.stringify(fresh), 'EX', ttlSeconds);
  return fresh;
}
```

**Database indexing** (not named in the original spec, but required to actually hit the 100k-row target):

```sql
CREATE INDEX idx_registrations_date ON registrations (registration_date);
CREATE INDEX idx_registrations_type ON registrations (registration_type);
CREATE INDEX idx_registrations_date_type ON registrations (registration_date, registration_type);
```

**Load testing target:** validate the 100,000-row claim explicitly rather than assuming it — a simple `k6` or `Artillery` script hitting `/api/reports/summary?start=...&end=...` at expected concurrent-user levels, run against a seeded 100k-row table, should complete p95 requests in a target you define upfront (e.g., <500ms) — see [Section 10](#10-testing-strategy).

**Payload minimization:** for the raw data table endpoint, avoid `SELECT *`; return only the columns the current view renders, and compress responses (`gzip`/`brotli`) at the reverse proxy level.

---

## 6. Non-Technical User UX Guidelines

*(New — the original user prompt explicitly required a UI "suitable for non-technical users," but the generated spec never translated this into a dedicated section. Adding it here closes that structural gap.)*

| Principle | Concrete guidance |
|---|---|
| **Plain-language labels** | Avoid technical terms like "aggregation" or "cache" anywhere in the UI — use "Total registrations," "Last updated 4 minutes ago." |
| **Sync status visibility** | Show a small, always-visible indicator: "✅ Synced 5 min ago" / "⚠️ Sync failed — click to retry," so non-technical staff aren't guessing whether data is current. |
| **Zero dead-ends** | Every empty state (e.g., "no registrations in this range") should suggest a next action ("Try a wider date range" button), not just show blank space. |
| **One-click common tasks** | "Generate Today's Report" should be a single prominent button on the main screen — don't require navigating through date pickers for the most common daily task. |
| **Confirmation before destructive actions** | Manual sync triggers, role changes, and exports of large datasets should show a brief confirmation ("This will refresh all data — continue?") to prevent accidental clicks. |
| **Error messages in human terms** | Replace raw error text ("Error: 429") with "Google Sheets is temporarily busy — retrying automatically" and log the raw error separately for admins. |

---

## 7. Proposed Database Schema

*(New — the original spec named PostgreSQL for scale but never defined what it stores.)*

```mermaid
erDiagram
  REGISTRATIONS ||--o{ PAYMENTS : has
  USERS ||--o{ AUDIT_LOGS : creates
  REGISTRATIONS {
    uuid id PK
    string registrant_name
    int registration_type "200 or 250, CHECK constraint"
    date registration_date
    string status
    string source_row_hash "dedup key from sheet row"
    timestamp synced_at
  }
  PAYMENTS {
    uuid id PK
    uuid registration_id FK
    string payment_type
    decimal amount
    string currency
    timestamp paid_at
  }
  USERS {
    uuid id PK
    string email
    string password_hash
    string role "admin | analyst | viewer"
    timestamp created_at
  }
  AUDIT_LOGS {
    uuid id PK
    uuid user_id FK
    string action_type
    string resource
    jsonb metadata
    timestamp created_at
  }
  SYNC_ERRORS {
    uuid id PK
    jsonb raw_row
    text errors
    timestamp flagged_at
  }
```

```sql
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registrant_name TEXT NOT NULL,
  registration_type INT NOT NULL CHECK (registration_type IN (200, 250)),
  registration_date DATE NOT NULL,
  status TEXT DEFAULT 'confirmed',
  source_row_hash TEXT UNIQUE NOT NULL, -- prevents duplicate ingestion of the same sheet row
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL,
  amount NUMERIC(10,2),
  currency TEXT DEFAULT 'INR',
  paid_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','analyst','viewer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action_type TEXT NOT NULL,
  resource TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sync_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_row JSONB NOT NULL,
  errors TEXT NOT NULL,
  flagged_at TIMESTAMPTZ DEFAULT now()
);
```

`currency` defaults to `INR` as a working assumption — see [Section 14](#14-ambiguities--assumptions).

---

## 8. API Endpoint Reference

*(New — the spec implied a backend but never defined its contract.)*

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticate, returns JWT + refresh cookie |
| `POST` | `/api/auth/refresh` | Cookie | Issue a new short-lived JWT |
| `GET` | `/api/registrations` | Admin, Analyst | Paginated, filterable raw registration rows |
| `GET` | `/api/reports/summary` | All roles | Aggregated stats for a date range |
| `GET` | `/api/reports/daily/:date` | All roles | Fetch/regenerate the daily PDF report |
| `POST` | `/api/sync/trigger` | Admin | Manually trigger a sheet sync |
| `GET` | `/api/sync/status` | All roles | Last sync time, success/failure state |
| `GET` | `/api/export/csv` | Admin, Analyst | Stream a CSV of the current filtered query |
| `GET` | `/api/export/xlsx` | Admin, Analyst | Multi-sheet Excel export |
| `GET` | `/api/audit-logs` | Admin | Paginated audit trail |
| `GET` | `/api/forecast` | Admin, Analyst | *(Optional, Section 5.5)* forecast data points |

---

## 9. Environment Variables & Configuration

*(New)*

| Variable | Purpose | Example |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to the service account JSON key | `./secrets/service-account.json` |
| `GOOGLE_SHEET_ID` | Target spreadsheet ID (from its URL) | `1LA9OtAT84949JbJrWXRGY03sczWyNLsXULykvd1Eerk` |
| `GOOGLE_SHEET_RANGE` | Range to read | `Registrations!A2:K` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/dbname` |
| `REDIS_URL` | Redis connection string | `redis://host:6379` |
| `JWT_SECRET` | Signing secret for access tokens | *(random 32+ byte value)* |
| `JWT_REFRESH_SECRET` | Separate secret for refresh tokens | *(random 32+ byte value)* |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Email delivery for scheduled reports | — |
| `REPORT_TIMEZONE` | Timezone for CRON scheduling | `Asia/Kolkata` |
| `SYNC_INTERVAL_CRON` | CRON expression for scheduled sync | `0 * * * *` (hourly) |

> **Note on the Sheet ID:** the spreadsheet URL in the original request (`.../d/1LA9OtAT84949JbJrWXRGY03sczWyNLsXURgb.../edit?gid=1059400240#gid=105940`) contains a truncated `gid` fragment (`105940` vs. `1059400240` earlier in the same URL) — confirm the exact sheet tab GID before hardcoding it, since a mismatched `gid` will silently point the dashboard at the wrong tab.

---

## 10. Testing Strategy

*(New)*

| Layer | Tooling | What to cover |
|---|---|---|
| Unit tests | Jest / Vitest | Validation logic, preset date resolution, backoff timing math, PDF filename generation |
| Integration tests | Supertest | API endpoints against a test PostgreSQL instance (e.g., via Testcontainers) |
| End-to-end tests | Playwright or Cypress | Full flow: login → select date range → view charts → export CSV → verify file contents |
| Load tests | k6 or Artillery | Seed 100,000 rows; verify pagination and aggregation endpoints meet latency targets under concurrent load |
| Security tests | OWASP ZAP (baseline scan) | Confirm RBAC boundaries actually reject unauthorized roles, not just hide UI elements |

**Acceptance check for the 100k-row target specifically:** seed the database, then run the aggregation and paginated-table endpoints under representative concurrency, and record p50/p95/p99 latencies — this converts the spec's vague "without significant degradation" into a number you can actually pass or fail against.

---

## 11. Deployment & DevOps

*(New)*

**Suggested environment separation:** `development` → `staging` → `production`, each with its own Google Sheet (or a sandboxed range) so testing sync logic never touches live registration data.

```yaml
# docker-compose.yml (development)
services:
  api:
    build: ./backend
    env_file: .env
    ports: ["3000:3000"]
    depends_on: [db, redis]
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: registrations
      POSTGRES_PASSWORD: devpassword
    ports: ["5432:5432"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
  frontend:
    build: ./frontend
    ports: ["5173:5173"]
```

**CI/CD pipeline stages (typical):** lint → unit tests → build → integration tests (against ephemeral DB) → deploy to staging → smoke test → manual/automatic promotion to production.

**Monitoring:** application errors (e.g., Sentry), infrastructure metrics (Prometheus/Grafana or your host's built-in monitoring), and a specific alert on **sync job failure** — since this system's core value proposition depends on the sync succeeding, a silent sync failure is the most damaging possible outage.

---

## 12. Implementation Roadmap (Phased)

*(New — turns the feature list into a build sequence with verification checkpoints.)*

**Phase 0 — Foundations**
1. Scaffold Vite + TypeScript frontend and Fastify/Express + TypeScript backend.
2. Provision PostgreSQL and Redis (local via Docker Compose).
3. Apply the schema from [Section 7](#7-proposed-database-schema).
- ✅ *Verify:* backend boots, connects to DB and Redis, health check endpoint returns 200.

**Phase 1 — Data Integration**
1. Set up the Google Cloud service account per [Section 5.1](#51-data-integration-and-synchronization).
2. Implement `fetchRegistrationRows`, `withRetry`, and `validateRow`.
3. Wire a manual sync trigger endpoint before adding CRON.
- ✅ *Verify:* triggering sync inserts rows matching the sheet, and a deliberately malformed row lands in `sync_errors` instead of crashing the sync.

**Phase 2 — Core Reporting**
1. Build `/api/reports/summary` and `/api/reports/daily/:date`.
2. Implement the PDFKit report template.
3. Add CRON scheduling + email dispatch.
- ✅ *Verify:* a manually triggered report and a CRON-generated report for the same date produce identical PDFs.

**Phase 3 — Frontend Dashboard & Visualization**
1. Build the date range selector + presets.
2. Implement the four chart types with drill-down wired to shared filter state.
3. Add sync status indicator and loading/empty states per [Section 6](#6-non-technical-user-ux-guidelines).
- ✅ *Verify:* a non-technical test user can generate today's report and read the charts without guidance.

**Phase 4 — Export & Security**
1. Implement CSV/XLSX export endpoints.
2. Implement JWT auth, RBAC middleware, and the audit log.
3. Enforce HTTPS and secrets management in staging.
- ✅ *Verify:* a Viewer-role account receives 403 on export/sync endpoints even if the UI is bypassed via direct API calls.

**Phase 5 — Performance Hardening**
1. Add indexes, cursor pagination, and Redis caching with invalidation.
2. Run load tests against a seeded 100k-row dataset.
- ✅ *Verify:* p95 latency targets from [Section 10](#10-testing-strategy) are met.

**Phase 6 — Optional Expansion**
1. Forecasting endpoint/microservice per [Section 5.5](#55-predictive--advanced-analytics-optional-expansion).
- ✅ *Verify:* forecast chart renders with a clearly labeled "estimate" disclaimer distinguishing it from actual data.

---

## 13. Troubleshooting & Common Pitfalls

*(New)*

| Symptom | Likely Cause | Fix |
|---|---|---|
| `403 Permission denied` from Sheets API | Sheet not shared with the service account email | Share the sheet with the exact `...@...iam.gserviceaccount.com` address |
| Sync inserts duplicate rows every run | No stable dedup key | Add `source_row_hash` unique constraint + upsert |
| Chart data doesn't match the report PDF for the same date | Chart uses client-cached aggregation while report recomputes fresh | Ensure both read from the same cached/invalidated aggregation source |
| CRON report generates at the wrong time | No explicit timezone passed to `node-cron` | Always pass `{ timezone: 'Asia/Kolkata' }` (or your event's timezone) |
| Pagination gets slower as users page further in | Using `OFFSET` pagination on a large table | Switch to cursor/keyset pagination past ~10k rows |
| `429 Too Many Requests` from Google during bulk backfill | No backoff, or too-frequent polling | Apply exponential backoff; reduce sync frequency; batch reads with wider ranges instead of per-row calls |
| Viewer-role users can still call export endpoints via direct API request | RBAC only enforced in the frontend UI | Enforce `requireRole` middleware server-side on every route, never trust frontend-only checks |
| Excel export missing formatting when reopened | Writing raw values without ExcelJS style objects | Apply `font`, `numFmt`, and `autoFilter` explicitly, as shown in [Section 5.6](#56-data-export-capabilities) |

---

## 14. Ambiguities & Assumptions

*(New — the original spec left several points implicit; this section makes them explicit so an implementer can confirm or correct them with stakeholders before building.)*

1. **Meaning of registration types "200" and "250."** Neither the original prompt nor the generated spec defines what these numbers represent. Given the Chennai/India context of this request and the presence of "registration" alongside "payment type," the most probable interpretation is that these are **fee tiers in rupees** (₹200 vs. ₹250 registration categories, e.g., early-bird vs. standard, or student vs. general). This document assumes that interpretation throughout (e.g., `currency DEFAULT 'INR'` in the schema) — **confirm with stakeholders before finalizing the database `CHECK` constraint**, since if these are category codes unrelated to currency, the constraint and report labels should say so explicitly rather than implying a price.
2. **"Real-time" refresh, as requested in the original prompt.** The generated spec only implements this via CRON polling, which is not truly real-time. This document adds a suggested push-based alternative (Apps Script `onEdit` webhook) in [Section 5.1](#51-data-integration-and-synchronization), but confirm whether near-real-time (minutes) is acceptable or whether true push-based sync is required.
3. **Report "branding elements."** The original spec calls for "parameterized branding" but doesn't specify a logo, color scheme, or organization name. Treat `title`/`subtitle`/logo path as configuration values (see the `DailyReportData` interface in [Section 5.2](#52-daily-registration-report-generation)) to be supplied by the event organizer.
4. **User provisioning.** The spec defines roles (Admin/Analyst/Viewer) but not how users are created — this document assumes an Admin-managed user table (see [Section 7](#7-proposed-database-schema)) rather than self-registration, since open self-registration would be unusual for an internal reporting tool.
5. **Google Sheet URL fragment.** As noted in [Section 9](#9-environment-variables--configuration), the `gid` value in the originally supplied URL appears truncated/inconsistent — verify the exact tab ID before hardcoding it.

---

## 15. External Resources & Further Reading

*(New)*

**Official documentation**
- Google Sheets API (v4): https://developers.google.com/sheets/api
- Google Cloud service accounts: https://cloud.google.com/iam/docs/service-account-overview
- Node.js: https://nodejs.org/en/docs
- Vite: https://vitejs.dev
- React: https://react.dev
- Fastify: https://fastify.dev/docs/latest/
- Express: https://expressjs.com
- PostgreSQL: https://www.postgresql.org/docs/
- Redis: https://redis.io/docs/latest/
- node-cron: https://www.npmjs.com/package/node-cron

**Libraries referenced in this document**
- googleapis (Node client): https://www.npmjs.com/package/googleapis
- Recharts: https://recharts.org
- Chart.js: https://www.chartjs.org
- PDFKit: https://pdfkit.org
- Puppeteer: https://pptr.dev
- ExcelJS: https://www.npmjs.com/package/exceljs
- fast-csv: https://c2fo.github.io/fast-csv/
- date-fns: https://date-fns.org

**Security & best practices**
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- JWT best practices (IETF): https://datatracker.ietf.org/doc/html/rfc8725
- Web Content Accessibility Guidelines (WCAG) 2.2: https://www.w3.org/TR/WCAG22/

**Testing & performance tools**
- Playwright: https://playwright.dev
- k6: https://k6.io/docs/
- Testcontainers (Node): https://node.testcontainers.org

---

## 16. Appendix: Original Specification (Verbatim)

The complete, unmodified original document is preserved below for reference and diffing against this enhanced version.

```markdown
# Comprehensive Web-Based Analytics Dashboard Specification
**Source Data:** Google Sheets (Registration Data)
**Target Architecture:** Node.js, TypeScript, Vite (React/Vue)

## 1. System Overview
This document outlines the technical specifications and feature requirements for a full-stack web application designed to ingest, process, visualize, and report on registration data from a specified Google Sheet. This specification is optimized for automated generation and rapid development.

## 2. Technical Stack Definition
* **Frontend Environment:** Vite-powered Single Page Application (React or Vue) using TypeScript.
* **Backend API:** Node.js with Express or Fastify (TypeScript).
* **Data Integration:** Google Sheets API v4 (via `googleapis` Node client).
* **Data Processing & Caching:** Redis (for rate-limit mitigation and caching) and an intermediate PostgreSQL database for handling 100k+ row scalability.
* **Visualization:** Recharts, Chart.js, or D3.js.
* **Document Generation:** Puppeteer or PDFKit (for PDF), ExcelJS (for XLSX), and fast-csv (for CSV).

## 3. Core Modules & Features

### 3.1. Data Integration and Synchronization
* **Authentication:** Service Account via OAuth 2.0. Credentials stored securely in backend environment variables.
* **Ingestion Engine:**
    * Configurable CRON jobs for hourly/daily syncs.
    * Manual Webhook/Trigger for on-demand sync.
    * Intelligent retry logic with exponential backoff for Google API rate limits (HTTP 429).
* **Validation Layer:** Middleware to sanitize raw sheet data. Flags null values, malformed timestamps, and invalid payment types before inserting into the analytics pipeline.

### 3.2. Daily Registration Report Generation
* **PDF Engine:** High-fidelity PDF generation triggered via backend route.
* **Content Specifications:**
    * **Registration Types:** strict categorization and conditional logic to isolate Type `200` vs. Type `250`.
    * **Financials:** Payment type breakdown.
    * **Layout:** Professional headers, dynamic timestamps, page pagination, and parameterized branding.
* **Delivery:** Scheduled email dispatch via SMTP/SendGrid or immediate client-side blob download. Dynamic filename generation (e.g., `Registration_Report_YYYYMMDD_Subtitle.pdf`).

### 3.3. Date Range Reporting & Filtering
* **UI Components:** Interactive DatePicker (support for single, range, and multi-day).
* **Presets:** Quick-select buttons mapping to ISO date ranges: Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Last Month, This Quarter, YTD.
* **Aggregation Metrics:** Total volume, delta from previous period, categorical breakdowns.

### 3.4. Interactive Data Visualization
* **Visual Hierarchy:**
    * *Time-Series Analysis:* Line/Area charts showing daily registration volume trends.
    * *Categorical Distribution:* Donut charts for Registration Type (200 vs 250).
    * *Financial Distribution:* Stacked bar charts for Payment Type.
    * *Growth Tracking:* Cumulative step/line charts for total registrations over time.
* **UX/UI:** Fully responsive SVG/Canvas rendering. Hover states with precise tooltip metrics. Drill-down capabilities clicking into specific chart segments to filter the global dashboard state.

### 3.5. Predictive & Advanced Analytics (Optional Expansion)
* **Forecasting Hook:** API endpoints structured to easily integrate predictive modeling scripts (e.g., Python microservice) to forecast future registration volumes based on historical ingestion rates.

### 3.6. Data Export Capabilities
* **PDF:** Formatted WYSIWYG exports of the current dashboard view.
* **Excel (XLSX):** Multi-sheet workbooks. Sheet 1: Summary Stats. Sheet 2: Raw filtered data. Applies native Excel table formatting.
* **CSV:** Fast, unformatted data dump of the current query state.

### 3.7. Security and Access Control
* **Authentication:** JWT-based session management.
* **RBAC (Role-Based Access Control):**
    * *Admin:* Full system config, manual sync triggers, user management.
    * *Analyst:* View dashboards, create custom date queries, export raw data.
    * *Viewer:* View-only access to pre-generated daily reports.
* **Audit Logging:** Middleware tracking `userId`, `action_type`, and `timestamp` for all export and config changes.

### 3.8. Performance and Scalability
* **Data Handling:** Implementation of cursor-based or offset pagination for data tables.
* **Optimization:** API responses payload minimization. Aggregations calculated server-side or at the database level rather than client-side to easily support the 100,000+ row threshold.
```

---

*End of document.*
