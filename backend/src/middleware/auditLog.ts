import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../database/db.js';
import { AuthedRequest } from './auth.js';

export async function auditLog(
  userId: string | undefined,
  actionType: string,
  resource?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action_type, resource, metadata)
       VALUES ($1, $2, $3, $4)`,
      [userId || null, actionType, resource || null, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
    // Don't throw — audit log failure shouldn't break the request
  }
}

export function withAudit(actionType: string, getResource?: (req: FastifyRequest) => string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = (request as AuthedRequest).user;
    const resource = getResource ? getResource(request) : undefined;
    // Log asynchronously, don't block the request
    auditLog(user?.userId, actionType, resource);
  };
}
