import { FastifyInstance } from 'fastify';
import { query } from '../database/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { generateForecast, DailyDataPoint } from '../services/forecastService.js';
import { withCache } from '../services/cache.js';

export async function forecastRoutes(app: FastifyInstance) {
  app.get(
    '/api/forecast',
    { preHandler: [authenticate, requireRole('admin', 'analyst')] },
    async (request) => {
      const { days = '14', target } = request.query as { days?: string; target?: string };
      const horizonDays = Math.max(3, Math.min(60, parseInt(days, 10) || 14));

      const cacheKey = `forecast:horizon:${horizonDays}`;

      return withCache(cacheKey, async () => {
        // Query daily registration counts
        const dailyResult = await query(
          `SELECT registration_date as date, COUNT(*) as count
           FROM registrations
           WHERE registration_date IS NOT NULL
           GROUP BY registration_date
           ORDER BY registration_date ASC`
        );

        const historical: DailyDataPoint[] = dailyResult.rows.map((r: any) => ({
          date: r.date,
          count: parseInt(r.count, 10),
        }));

        // Fetch goal from app_settings or default to 500
        let goalTarget = target ? parseInt(target, 10) : 500;
        if (!target) {
          try {
            const goalSetting = await query(
              `SELECT value FROM app_settings WHERE key = 'registration_goal'`
            );
            if (goalSetting.rows[0]?.value) {
              goalTarget = parseInt(goalSetting.rows[0].value, 10);
            }
          } catch {
            // Default to 500 if query fails
          }
        }

        const forecast = generateForecast(historical, horizonDays, goalTarget);

        return {
          success: true,
          horizonDays,
          ...forecast,
          generatedAt: new Date().toISOString(),
        };
      }, 300); // 5-minute cache
    }
  );
}
