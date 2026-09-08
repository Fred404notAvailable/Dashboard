import { describe, it, expect } from 'vitest';
import { query } from '../src/database/db.js';

describe('Expenses Database and Calculations', () => {
  it('should query seeded mock expenses', async () => {
    const result = await query<{ id: string; title: string; amount: number; category: string }>(
      'SELECT * FROM expenses ORDER BY expense_date DESC'
    );
    expect(result.rows.length).toBeGreaterThan(0);
    const first = result.rows[0];
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('amount');
    expect(first).toHaveProperty('category');
  });

  it('should calculate category spending correctly', async () => {
    const catResult = await query<{ category: string; total_amount: string; count: string }>(
      `SELECT category, SUM(amount) as total_amount, COUNT(*) as count 
       FROM expenses 
       GROUP BY category 
       ORDER BY total_amount DESC`
    );
    expect(catResult.rows.length).toBeGreaterThan(0);
    const totalFromCats = catResult.rows.reduce((sum, r) => sum + Number(r.total_amount), 0);
    
    const sumResult = await query<{ total_expenses: string; count: string }>(
      'SELECT SUM(amount) as total_expenses, COUNT(*) as count FROM expenses'
    );
    const totalExpenses = Number(sumResult.rows[0]?.total_expenses || 0);

    expect(totalFromCats).toBe(totalExpenses);
  });

  it('should insert, update, and delete an expense item', async () => {
    // 1. Insert
    const insertRes = await query<{ id: string }>(
      `INSERT INTO expenses (title, category, amount, expense_date, payment_method, vendor, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      ['Test Backdrop Banner', 'Venue & Stage', 4500, '2026-09-08', 'GPAY', 'PrintCity', 'Stage backdrop', 'overall-user-id']
    );
    expect(insertRes.rows.length).toBe(1);
    const newId = insertRes.rows[0].id;
    expect(newId).toBeDefined();

    // 2. Query the inserted record
    const fetchRes = await query<{ title: string; amount: number }>(
      'SELECT * FROM expenses WHERE id = $1',
      [newId]
    );
    expect(fetchRes.rows.length).toBe(1);
    expect(fetchRes.rows[0].title).toBe('Test Backdrop Banner');
    expect(Number(fetchRes.rows[0].amount)).toBe(4500);

    // 3. Update
    const updateRes = await query<{ title: string; amount: number }>(
      `UPDATE expenses 
       SET title = $1, amount = $2, updated_at = NOW() 
       WHERE id = $3 
       RETURNING *`,
      ['Test Backdrop Banner Updated', 5000, newId]
    );
    expect(updateRes.rows.length).toBe(1);
    expect(updateRes.rows[0].title).toBe('Test Backdrop Banner Updated');
    expect(Number(updateRes.rows[0].amount)).toBe(5000);

    // 4. Delete
    await query('DELETE FROM expenses WHERE id = $1', [newId]);
    const verifyDelete = await query('SELECT * FROM expenses WHERE id = $1', [newId]);
    expect(verifyDelete.rows.length).toBe(0);
  });

  it('should attach, retrieve, and update bill receipt attachments', async () => {
    const sampleReceipt = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const sampleFilename = 'stage_invoice_001.png';

    // 1. Create with receipt
    const insertRes = await query<{ id: string; receipt_url: string; receipt_name: string }>(
      `INSERT INTO expenses (title, category, amount, expense_date, payment_method, vendor, notes, receipt_url, receipt_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        'Sound Rental Settlement',
        'Audio / Visual & Lighting',
        7500,
        '2026-09-05',
        'GPAY',
        'ProSound Rentals',
        'Final settlement invoice',
        sampleReceipt,
        sampleFilename,
        'overall-user-id',
      ]
    );
    expect(insertRes.rows.length).toBe(1);
    const item = insertRes.rows[0];
    expect(item.receipt_url).toBe(sampleReceipt);
    expect(item.receipt_name).toBe(sampleFilename);

    // 2. Fetch and check
    const fetched = await query<{ id: string; receipt_url: string; receipt_name: string }>(
      'SELECT * FROM expenses WHERE id = $1',
      [item.id]
    );
    expect(fetched.rows.length).toBe(1);
    expect(fetched.rows[0].receipt_url).toBe(sampleReceipt);
    expect(fetched.rows[0].receipt_name).toBe(sampleFilename);

    // 3. Clean up
    await query('DELETE FROM expenses WHERE id = $1', [item.id]);
  });
});
