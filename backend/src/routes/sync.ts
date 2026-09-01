import { FastifyInstance } from 'fastify';
import cron from 'node-cron';
import { query } from '../database/db.js';
import { authenticate, requireRole, AuthedRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/auditLog.js';
import { performSync } from '../services/sheetsClient.js';
import { cacheDelPattern } from '../services/cache.js';
import { config } from '../config.js';

/** Run a full sync, update sync_status, and return the result. */
async function runSync(triggeredBy: string) {
  // Check if already running
  const running = await query(`SELECT id FROM sync_status WHERE status = 'running' LIMIT 1`);
  if (running.rows.length > 0) {
    throw new Error('A sync is already in progress');
  }

  // Create sync record
  const syncRecord = await query(
    `INSERT INTO sync_status (started_at, status, triggered_by)
     VALUES (now(), 'running', $1) RETURNING id`,
    [triggeredBy]
  );
  const syncId = syncRecord.rows[0].id;

  try {
    const result = await performSync();

    await query(
      `UPDATE sync_status
       SET status = 'success', completed_at = now(),
           rows_processed = $2, rows_inserted = $3, rows_updated = $4, rows_failed = $5
       WHERE id = $1`,
      [syncId, result.rowsProcessed, result.rowsInserted, result.rowsUpdated, result.rowsFailed]
    );

    // Invalidate cached report summaries so fresh data is served immediately
    await cacheDelPattern('report:summary:*');

    return { syncId, result };
  } catch (err: any) {
    await query(
      `UPDATE sync_status SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1`,
      [syncId, err.message]
    );
    throw err;
  }
}

/** Start the CRON scheduler. Call this once at server startup. */
export function startSyncScheduler() {
  const cronExpr = config.syncIntervalCron;
  if (!cronExpr || !cron.validate(cronExpr)) {
    console.warn(`[cron] Invalid or missing SYNC_INTERVAL_CRON ("${cronExpr}") — scheduler disabled.`);
    return;
  }

  console.log(`[cron] Sync scheduler started — expression: "${cronExpr}" (${config.reportTimezone})`);

  cron.schedule(
    cronExpr,
    async () => {
      console.log('[cron] Scheduled sync starting…');
      try {
        const { syncId, result } = await runSync('cron');
        console.log(
          `[cron] Sync ${syncId} complete — inserted: ${result.rowsInserted}, ` +
            `updated: ${result.rowsUpdated}, failed: ${result.rowsFailed}`
        );
      } catch (err: any) {
        console.error('[cron] Scheduled sync failed:', err.message);
      }
    },
    { timezone: config.reportTimezone }
  );
}

// ─── Routes ────────────────────────────────────────────────────────────────

export async function syncRoutes(app: FastifyInstance) {
  // POST /api/sync/trigger — manual sync (Admin only)
  app.post('/api/sync/trigger', { preHandler: [authenticate, requireRole('admin')] }, async (request, reply) => {
    const user = (request as AuthedRequest).user!;

    // Guard: only one sync at a time
    const runningResult = await query(`SELECT id FROM sync_status WHERE status = 'running' LIMIT 1`);
    if (runningResult.rows.length > 0) {
      return reply.status(409).send({ error: 'A sync is already in progress' });
    }

    await auditLog(user.userId, 'sync_trigger', `sync:manual`);

    // Fire the sync asynchronously — respond immediately so the UI stays responsive
    setImmediate(async () => {
      try {
        const { syncId, result } = await runSync(user.email);
        console.log(
          `[sync] Manual sync ${syncId} triggered by ${user.email} — ` +
            `inserted: ${result.rowsInserted}, updated: ${result.rowsUpdated}, failed: ${result.rowsFailed}`
        );
      } catch (err: any) {
        console.error(`[sync] Manual sync by ${user.email} failed:`, err.message);
      }
    });

    return {
      status: 'accepted',
      message: 'Sync started. Poll /api/sync/status for progress.',
    };
  });

  // GET /api/sync/status — last sync info
  app.get('/api/sync/status', { preHandler: [authenticate] }, async () => {
    const result = await query(
      `SELECT id, started_at, completed_at, status, rows_processed, rows_inserted,
              rows_updated, rows_failed, error_message, triggered_by
       FROM sync_status
       ORDER BY started_at DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      return { lastSync: null, message: 'No sync has been performed yet' };
    }

    const s = result.rows[0];
    return {
      lastSync: {
        id: s.id,
        startedAt: s.started_at,
        completedAt: s.completed_at,
        status: s.status,
        rowsProcessed: s.rows_processed,
        rowsInserted: s.rows_inserted,
        rowsUpdated: s.rows_updated,
        rowsFailed: s.rows_failed,
        errorMessage: s.error_message,
        triggeredBy: s.triggered_by,
      },
    };
  });

  // GET /api/sync/errors — view flagged rows (Admin only)
  app.get('/api/sync/errors', { preHandler: [authenticate, requireRole('admin')] }, async (request) => {
    const { page = '1', pageSize = '50' } = request.query as { page?: string; pageSize?: string };
    const limit = Math.min(parseInt(pageSize) || 50, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    const countResult = await query(`SELECT COUNT(*) as total FROM sync_errors WHERE NOT resolved`);
    const result = await query(
      `SELECT id, sheet_tab, row_number, raw_row, errors, flagged_at
       FROM sync_errors WHERE NOT resolved
       ORDER BY flagged_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      errors: result.rows,
      total: parseInt(countResult.rows[0]?.total || '0'),
      page: Math.max(parseInt(page) || 1, 1),
      pageSize: limit,
    };
  });

  // POST /api/sync/errors/:id/resolve — mark a flagged row as resolved
  app.post(
    '/api/sync/errors/:id/resolve',
    { preHandler: [authenticate, requireRole('admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = (request as AuthedRequest).user!;

      const result = await query(
        `UPDATE sync_errors SET resolved = true WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Sync error not found' });
      }

      await auditLog(user.userId, 'sync_error_resolve', `sync_error:${id}`);
      return { resolved: true, id };
    }
  );
}
