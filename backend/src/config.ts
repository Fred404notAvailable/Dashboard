import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgres://pyros:pyros_dev_2026@localhost:5432/registrations',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Google Sheets — public CSV export (no API key required)
  // Make the sheet "Anyone with the link → Viewer" then set these:
  googleSheetId: process.env.GOOGLE_SHEET_ID || '',
  googleSheetGid200: process.env.GOOGLE_SHEET_GID_200 || '0',   // gid= from the ₹200 tab URL
  googleSheetGid250: process.env.GOOGLE_SHEET_GID_250 || '1',   // gid= from the ₹250 tab URL

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',

  // Reports
  reportTimezone: process.env.REPORT_TIMEZONE || 'Asia/Kolkata',
  reportTitle: process.env.REPORT_TITLE || 'FAC PYROS - Registration Report',
  reportSubtitle: process.env.REPORT_SUBTITLE || "That's How We Rock It!",
  registrationGoal: parseInt(process.env.REGISTRATION_GOAL || '500', 10),

  // Sync
  syncIntervalCron: process.env.SYNC_INTERVAL_CRON || '0 * * * *',
} as const;
