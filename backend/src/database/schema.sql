-- FAC PYROS Registration Analytics Dashboard — Database Schema (PostgreSQL Version)

CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  s_no INTEGER,
  registrant_name TEXT NOT NULL,
  reg_no TEXT,
  year TEXT,
  department TEXT,
  school TEXT,
  mobile_no TEXT,
  event_1 TEXT,
  event_2 TEXT,
  event_3 TEXT,
  payment_method TEXT,
  registration_type INTEGER NOT NULL CHECK (registration_type IN (200, 250)),
  registration_date DATE,
  source_row_hash TEXT UNIQUE NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'analyst', 'viewer')),
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action_type TEXT NOT NULL,
  resource TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_tab TEXT NOT NULL,
  row_number INTEGER,
  raw_row JSONB NOT NULL,
  errors TEXT NOT NULL,
  resolved INTEGER DEFAULT 0,
  flagged_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  rows_processed INTEGER DEFAULT 0,
  rows_inserted INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  rows_failed INTEGER DEFAULT 0,
  error_message TEXT,
  triggered_by TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registrations_date ON registrations (registration_date);
CREATE INDEX IF NOT EXISTS idx_registrations_type ON registrations (registration_type);
CREATE INDEX IF NOT EXISTS idx_registrations_date_type ON registrations (registration_date, registration_type);
CREATE INDEX IF NOT EXISTS idx_registrations_department ON registrations (department);
CREATE INDEX IF NOT EXISTS idx_registrations_school ON registrations (school);
CREATE INDEX IF NOT EXISTS idx_registrations_year ON registrations (year);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_sync_errors_flagged ON sync_errors (flagged_at);
