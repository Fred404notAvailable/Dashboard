import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { testConnection } from './database/db.js';
import { authRoutes } from './routes/auth.js';
import { reportRoutes } from './routes/reports.js';
import { syncRoutes } from './routes/sync.js';
import { exportRoutes } from './routes/export.js';
import { auditLogRoutes } from './routes/auditLogs.js';
import { pdfRoutes } from './routes/pdf.js';
import { forecastRoutes } from './routes/forecast.js';
import { settingsRoutes } from './routes/settings.js';
import { expenseRoutes } from './routes/expenses.js';
import { performSync } from './services/sheetsClient.js';

let appInstance: FastifyInstance | null = null;
let syncPromise: Promise<any> | null = null;

export async function buildApp(): Promise<FastifyInstance> {
  if (appInstance) return appInstance;

  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      transport: config.nodeEnv !== 'production' ? { target: 'pino-pretty' } : undefined,
    },
  });

  // CORS
  await app.register(cors, {
    origin: (origin, cb) => {
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With'],
  });

  // Cookies
  await app.register(cookie);

  // Health check
  app.get('/api/health', async () => {
    const dbOk = await testConnection();
    return {
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
      version: '1.0.0',
    };
  });

  // Register all routes
  await app.register(authRoutes);
  await app.register(reportRoutes);
  await app.register(expenseRoutes);
  await app.register(syncRoutes);
  await app.register(exportRoutes);
  await app.register(auditLogRoutes);
  await app.register(pdfRoutes);
  await app.register(forecastRoutes);
  await app.register(settingsRoutes);

  // Trigger initial Google Sheets sync if not yet loaded
  if (!syncPromise) {
    syncPromise = performSync().catch((err) =>
      console.warn(`⚠️ [Sync] Initial sync warning: ${err.message}`)
    );
  }

  appInstance = app;
  return app;
}
