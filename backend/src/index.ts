import { buildApp } from './app.js';
import { config } from './config.js';
import { testConnection } from './database/db.js';
import { startSyncScheduler } from './routes/sync.js';

const start = async () => {
  try {
    const app = await buildApp();
    const dbOk = await testConnection();
    if (!dbOk) {
      console.warn('💡 [DB] PostgreSQL is offline — serving responses via In-Memory Live Sync Store.');
    } else {
      console.log('✅ PostgreSQL database connected.');
    }

    startSyncScheduler();

    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`🚀 FAC PYROS Backend running on http://localhost:${config.port}`);
    console.log(`📊 API Health: http://localhost:${config.port}/api/health`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
