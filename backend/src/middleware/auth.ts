import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
}

export interface AuthedRequest extends FastifyRequest {
  user?: JwtPayload;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    (request as AuthedRequest).user = payload;
  } catch (err: any) {
    console.error('JWT Verification failed:', err.message);
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...allowed: Array<'admin' | 'analyst' | 'viewer'>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthedRequest).user;
    if (!user || !allowed.includes(user.role)) {
      return reply.status(403).send({ error: 'Forbidden — insufficient role permissions' });
    }
  };
}

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtAccessExpiry as any });
}

export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiry as any });
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtRefreshSecret) as JwtPayload;
}
