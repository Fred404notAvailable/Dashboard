import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { query } from '../database/db.js';
import { authenticate, requireRole, generateAccessToken, generateRefreshToken, verifyRefreshToken, AuthedRequest, JwtPayload } from '../middleware/auth.js';
import { auditLog } from '../middleware/auditLog.js';

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const result = await query(
      'SELECT id, email, password_hash, role, display_name FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Set refresh token as httpOnly cookie
    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    await auditLog(user.id, 'login', `user:${user.email}`);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.display_name,
      },
    };
  });

  // POST /api/auth/refresh
  app.post('/api/auth/refresh', async (request, reply) => {
    const token = (request as any).cookies?.refreshToken;
    if (!token) {
      return reply.status(401).send({ error: 'No refresh token provided' });
    }

    try {
      const payload = verifyRefreshToken(token);
      const newAccessToken = generateAccessToken({
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
      });
      return { accessToken: newAccessToken };
    } catch (err: any) {
      console.error('Refresh token verification failed:', err.message);
      return reply.status(401).send({ error: 'Invalid or expired refresh token' });
    }
  });

  // GET /api/auth/me — get current user info
  app.get('/api/auth/me', { preHandler: [authenticate] }, async (request) => {
    const user = (request as AuthedRequest).user!;
    const result = await query(
      'SELECT id, email, role, display_name, created_at FROM users WHERE id = $1',
      [user.userId]
    );
    if (result.rows.length === 0) {
      return { error: 'User not found' };
    }
    const u = result.rows[0];
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      displayName: u.display_name,
      createdAt: u.created_at,
    };
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as AuthedRequest).user!;

    // Clear the httpOnly refresh token cookie
    reply.clearCookie('refreshToken', { path: '/api/auth/refresh' });

    await auditLog(user.userId, 'logout', `user:${user.email}`);

    return { success: true };
  });
}
