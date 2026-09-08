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

export interface MockExpense {
  id: string;
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  payment_method: string;
  vendor: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export const MOCK_USERS = [
  {
    id: '00000000-0000-0000-0000-000000000000',
    email: 'overall@facpyros.in',
    password_hash: '$2b$10$qvq/oakXQyjzUpOJqPNz0uphYT7UP7SDDlrbQ26B1s/IxwXMIU8mm', // admin123
    role: 'overall',
    display_name: 'FAC Overall Coordinator',
    created_at: '2026-08-01T00:00:00Z',
  },
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
    password_hash: '$2b$10$qvq/oakXQyjzUpOJqPNz0uphYT7UP7SDDlrbQ26B1s/IxwXMIU8mm', // admin123
    role: 'analyst',
    display_name: 'FAC Analyst',
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'viewer@facpyros.in',
    password_hash: '$2b$10$qvq/oakXQyjzUpOJqPNz0uphYT7UP7SDDlrbQ26B1s/IxwXMIU8mm', // admin123
    role: 'viewer',
    display_name: 'FAC Viewer',
    created_at: '2026-08-01T00:00:00Z',
  },
];

// Starts empty — populated exclusively by live Google Sheet sync
export const MOCK_REGISTRATIONS: MockRegistration[] = [];

// Seed sample expenses for PYROS 2026
export const MOCK_EXPENSES: MockExpense[] = [
  {
    id: 'exp_1',
    title: 'Flagship Event Shields & Winner Trophies',
    category: 'Prizes & Shields',
    amount: 8500,
    expense_date: '2026-09-02',
    payment_method: 'GPAY',
    vendor: 'Crown Awards & Trophies',
    notes: 'Medals and engraved shields for all 3 flagship events',
    created_by: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-09-02T10:00:00Z',
  },
  {
    id: 'exp_2',
    title: 'Main Auditorium Audio-Visual & Lighting System',
    category: 'Audio / Visual & Lighting',
    amount: 12000,
    expense_date: '2026-09-04',
    payment_method: 'BANK TRANSFER',
    vendor: 'SoundPro Event Rentals',
    notes: 'Stage line array speakers, RGB stage pars and smoke machine',
    created_by: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-09-04T14:30:00Z',
  },
  {
    id: 'exp_3',
    title: 'Coordinator ID Badges, Lanyards & Registration Kits',
    category: 'Printing & Badges',
    amount: 3200,
    expense_date: '2026-09-01',
    payment_method: 'GPAY',
    vendor: 'Speedy Print Works',
    notes: '200 custom PYROS lanyards and spot registration receipts',
    created_by: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-09-01T11:15:00Z',
  },
  {
    id: 'exp_4',
    title: 'Guest Judges Hospitality & Refreshments',
    category: 'Food & Hospitality',
    amount: 4500,
    expense_date: '2026-09-07',
    payment_method: 'CASH',
    vendor: 'Campus Delight Caterers',
    notes: 'Lunch boxes, coffee, and water bottles for external jury members',
    created_by: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-09-07T13:00:00Z',
  },
  {
    id: 'exp_5',
    title: 'Stage Banners & Registration Desk Backdrops',
    category: 'Venue & Stage',
    amount: 5200,
    expense_date: '2026-09-03',
    payment_method: 'GPAY',
    vendor: 'Creative Flex & Signage',
    notes: '20x10ft main stage banner and 2 registration desk banners',
    created_by: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-09-03T16:00:00Z',
  },
];
