import { FastifyInstance } from 'fastify';
import { query } from '../database/db.js';
import { authenticate, requireRole, AuthedRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/auditLog.js';
import { cacheDelPattern } from '../services/cache.js';

export async function settingsRoutes(app: FastifyInstance) {
  // GET /api/settings — Retrieve app settings
  app.get(
    '/api/settings',
    { preHandler: [authenticate] },
    async () => {
      const result = await query(`SELECT key, value FROM app_settings`);
      const settings: Record<string, string> = {};
      for (const row of result.rows) {
        settings[row.key] = row.value;
      }
      return { settings };
    }
  );

  // PUT /api/settings/goal — Update registration target goal
  app.put(
    '/api/settings/goal',
    { preHandler: [authenticate, requireRole('admin')] },
    async (request, reply) => {
      const { target } = request.body as { target: number | string };
      const user = (request as AuthedRequest).user!;

      const goalNum = parseInt(String(target), 10);
      if (isNaN(goalNum) || goalNum <= 0) {
        return reply.status(400).send({ error: 'Goal target must be a positive integer' });
      }

      await query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('registration_goal', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [String(goalNum)]
      );

      await auditLog(user.userId, 'update_goal', `new_target:${goalNum}`);
      await cacheDelPattern('summary:*');
      await cacheDelPattern('forecast:*');

      return {
        success: true,
        registration_goal: goalNum,
        message: `Registration goal updated to ${goalNum}`,
      };
    }
  );
}
