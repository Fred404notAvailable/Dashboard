import { FastifyInstance } from 'fastify';
import { query } from '../database/db.js';
import { authenticate, requireRole, AuthedRequest } from '../middleware/auth.js';

export async function auditLogRoutes(app: FastifyInstance) {
  // GET /api/audit-logs — paginated audit trail (Admin only)
  app.get('/api/audit-logs', { preHandler: [authenticate, requireRole('admin')] }, async (request) => {
    const { page = '1', pageSize = '50' } = request.query as { page?: string; pageSize?: string };
    const limit = Math.min(parseInt(pageSize) || 50, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    const countResult = await query('SELECT COUNT(*) as total FROM audit_logs');
    const result = await query(
      `SELECT al.id, al.action_type, al.resource, al.metadata, al.created_at,
              u.email as user_email, u.display_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      logs: result.rows.map(r => ({
        id: r.id,
        actionType: r.action_type,
        resource: r.resource,
        metadata: r.metadata,
        createdAt: r.created_at,
        userEmail: r.user_email,
        userName: r.display_name,
      })),
      pagination: {
        page: Math.max(parseInt(page) || 1, 1),
        pageSize: limit,
        total: parseInt(countResult.rows[0]?.total || '0'),
      },
    };
  });
}
