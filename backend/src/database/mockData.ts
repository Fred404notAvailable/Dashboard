export interface MockRegistration {
  id: string;
  s_no: number | null;
  registrant_name: string;
  reg_no: string | null;
  year: string | null;
  department: string | null;
  school: string | null;
  mobile_no: string | null;
  event_1: string | null;
  event_2: string | null;
  event_3: string | null;
  payment_method: string | null;
  registration_type: number;
  registration_date: string;
  source_row_hash: string;
  synced_at: string;
}

export const MOCK_USERS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin@facpyros.in',
    password_hash: '$2b$10$qvq/oakXQyjzUpOJqPNz0uphYT7UP7SDDlrbQ26B1s/IxwXMIU8mm', // admin123
    role: 'admin',
    display_name: 'FAC Admin',
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'analyst@facpyros.in',
    password_hash: '$2b$10$qvq/oakXQyjzUpOJqPNz0uphYT7UP7SDDlrbQ26B1s/IxwXMIU8mm',
    role: 'analyst',
    display_name: 'FAC Analyst',
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'viewer@facpyros.in',
    password_hash: '$2b$10$qvq/oakXQyjzUpOJqPNz0uphYT7UP7SDDlrbQ26B1s/IxwXMIU8mm',
    role: 'viewer',
    display_name: 'FAC Viewer',
    created_at: '2026-08-01T00:00:00Z',
  },
];

// Starts empty — populated exclusively by live Google Sheet sync
export const MOCK_REGISTRATIONS: MockRegistration[] = [];
