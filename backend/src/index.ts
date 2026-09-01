import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { testConnection } from './database/db.js';
import { authRoutes } from './routes/auth.js';
import { reportRoutes } from './routes/reports.js';
import { syncRoutes, startSyncScheduler } from './routes/sync.js';
import { exportRoutes } from './routes/export.js';
import { auditLogRoutes } from './routes/auditLogs.js';
import { pdfRoutes } from './routes/pdf.js';
import { forecastRoutes } from './routes/forecast.js';
import { settingsRoutes } from './routes/settings.js';
import { performSync } from './services/sheetsClient.js';

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    transport: config.nodeEnv !== 'production' ? { target: 'pino-pretty' } : undefined,
  },
});

const start = async () => {
  // Plugins
  await app.register(cors, {
    origin: (origin, cb) => {
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With'],
  });

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

  // Register routes
  await app.register(authRoutes);
  await app.register(reportRoutes);
  await app.register(syncRoutes);
  await app.register(exportRoutes);
  await app.register(auditLogRoutes);
  await app.register(pdfRoutes);
  await app.register(forecastRoutes);
  await app.register(settingsRoutes);

  // Start server
  try {
    const dbOk = await testConnection();
    if (!dbOk) {
      console.warn('💡 [DB] PostgreSQL is offline — serving responses via In-Memory Live Sync Store.');
    } else {
      console.log('✅ PostgreSQL database connected.');
    }

    // Always run initial sync from live Google Sheet and start background scheduler
    performSync()
      .then((res) => console.log(`✅ [Sync] Ingested ${res.rowsProcessed} live rows from Google Sheets`))
      .catch((err) => console.warn(`⚠️ [Sync] Initial sync warning: ${err.message}`));
    startSyncScheduler();

    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`🚀 FAC PYROS Backend running on http://localhost:${config.port}`);
    console.log(`📊 API Health: http://localhost:${config.port}/api/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
