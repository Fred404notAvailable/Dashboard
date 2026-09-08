import { FastifyInstance } from 'fastify';
import { query } from '../database/db.js';
import { authenticate, requireRole, AuthedRequest } from '../middleware/auth.js';
import { resolvePreset, Preset } from '../services/dateUtils.js';
import { auditLog } from '../middleware/auditLog.js';

export async function expenseRoutes(app: FastifyInstance) {
  // GET /api/expenses — list & filter expenses
  app.get(
    '/api/expenses',
    { preHandler: [authenticate, requireRole('admin', 'overall')] },
    async (request) => {
      const {
        start,
        end,
        preset,
        category,
        payment,
        search,
        page = '1',
        pageSize = '50',
      } = request.query as Record<string, string>;

      let dateRange: { start: string; end: string };
      if (preset) {
        dateRange = resolvePreset(preset as Preset);
      } else if (start && end) {
        dateRange = { start, end };
      } else {
        dateRange = resolvePreset('all');
      }

      // Fetch all matching expenses
      const result = await query(
        `SELECT id, title, category, amount, expense_date, payment_method, vendor, notes, receipt_url, receipt_name, created_by, created_at
         FROM expenses
         WHERE expense_date BETWEEN $1 AND $2
         ORDER BY expense_date DESC, created_at DESC`,
        [dateRange.start, dateRange.end]
      );

      let items = result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        amount: Number(r.amount),
        expenseDate: r.expense_date,
        paymentMethod: r.payment_method,
        vendor: r.vendor,
        notes: r.notes,
        receiptUrl: r.receipt_url || null,
        receiptName: r.receipt_name || null,
        createdBy: r.created_by,
        createdAt: r.created_at,
      }));

      // In-memory filters for category, payment, search
      if (category) {
        items = items.filter(
          (e) => e.category.toLowerCase() === category.toLowerCase()
        );
      }
      if (payment) {
        items = items.filter(
          (e) => e.paymentMethod.toUpperCase() === payment.toUpperCase()
        );
      }
      if (search) {
        const s = search.toLowerCase().trim();
        items = items.filter(
          (e) =>
            e.title.toLowerCase().includes(s) ||
            (e.vendor && e.vendor.toLowerCase().includes(s)) ||
            (e.notes && e.notes.toLowerCase().includes(s))
        );
      }

      const totalExpenses = items.reduce((sum, e) => sum + e.amount, 0);
      const limit = Math.min(parseInt(pageSize) || 50, 100);
      const currentPage = Math.max(parseInt(page) || 1, 1);
      const offset = (currentPage - 1) * limit;
      const paginatedData = items.slice(offset, offset + limit);

      return {
        data: paginatedData,
        summary: {
          totalExpenses,
          count: items.length,
        },
        pagination: {
          page: currentPage,
          pageSize: limit,
          totalRows: items.length,
          totalPages: Math.ceil(items.length / limit),
        },
        filters: { dateRange, category, payment, search },
      };
    }
  );

  // GET /api/expenses/summary — financial health, net profit, category distribution
  app.get(
    '/api/expenses/summary',
    { preHandler: [authenticate, requireRole('admin', 'overall')] },
    async (request) => {
      const { start, end, preset } = request.query as Record<string, string>;

      let dateRange: { start: string; end: string };
      if (preset) {
        dateRange = resolvePreset(preset as Preset);
      } else if (start && end) {
        dateRange = { start, end };
      } else {
        dateRange = resolvePreset('all');
      }

      // 1. Calculate Gross Revenue from registrations
      const regResult = await query(
        `SELECT registration_type, COUNT(*) as count
         FROM registrations
         WHERE registration_date BETWEEN $1 AND $2
         GROUP BY registration_type`,
        [dateRange.start, dateRange.end]
      );

      const type200 = parseInt(
        regResult.rows.find((r) => r.registration_type === 200)?.count || '0'
      );
      const type250 = parseInt(
        regResult.rows.find((r) => r.registration_type === 250)?.count || '0'
      );
      const grossRevenue = type200 * 200 + type250 * 250;
      const totalRegistrations = type200 + type250;

      // 2. Calculate Total Expenses and Category Breakdown
      const catResult = await query(
        `SELECT category, SUM(amount) as total, COUNT(*) as count
         FROM expenses
         WHERE expense_date BETWEEN $1 AND $2
         GROUP BY category`,
        [dateRange.start, dateRange.end]
      );

      let totalExpenses = 0;
      const categoryBreakdown = catResult.rows.map((r) => {
        const total = Number(r.total);
        totalExpenses += total;
        return {
          category: r.category,
          amount: total,
          count: parseInt(r.count),
          percentage: 0,
        };
      });

      // Compute category percentages
      categoryBreakdown.forEach((c) => {
        c.percentage =
          totalExpenses > 0
            ? Math.round((c.amount / totalExpenses) * 1000) / 10
            : 0;
      });

      // 3. Net Balance / Profit
      const netBalance = grossRevenue - totalExpenses;
      const profitMargin =
        grossRevenue > 0
          ? Math.round((netBalance / grossRevenue) * 1000) / 10
          : 0;
      const expenseRatio =
        grossRevenue > 0
          ? Math.round((totalExpenses / grossRevenue) * 1000) / 10
          : 0;

      return {
        dateRange,
        financials: {
          grossRevenue,
          totalExpenses,
          netBalance,
          profitMargin,
          expenseRatio,
          totalRegistrations,
          tierRevenue: {
            type200: type200 * 200,
            type250: type250 * 250,
          },
        },
        categoryBreakdown,
      };
    }
  );

  // POST /api/expenses — add an expense item
  app.post(
    '/api/expenses',
    { preHandler: [authenticate, requireRole('admin', 'overall')] },
    async (request, reply) => {
      const user = (request as AuthedRequest).user!;
      const {
        title,
        category,
        amount,
        expenseDate,
        paymentMethod = 'CASH',
        vendor,
        notes,
        receiptUrl,
        receiptName,
      } = request.body as {
        title?: string;
        category?: string;
        amount?: number;
        expenseDate?: string;
        paymentMethod?: string;
        vendor?: string;
        notes?: string;
        receiptUrl?: string | null;
        receiptName?: string | null;
      };

      if (!title?.trim()) {
        return reply.status(400).send({ error: 'Expense title is required' });
      }
      if (!category?.trim()) {
        return reply.status(400).send({ error: 'Category is required' });
      }
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return reply
          .status(400)
          .send({ error: 'Amount must be a positive number' });
      }
      const date =
        expenseDate && /^\d{4}-\d{2}-\d{2}$/.test(expenseDate)
          ? expenseDate
          : new Date().toISOString().split('T')[0];

      const res = await query(
        `INSERT INTO expenses (title, category, amount, expense_date, payment_method, vendor, notes, receipt_url, receipt_name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          title.trim(),
          category.trim(),
          numAmount,
          date,
          paymentMethod.toUpperCase().trim(),
          vendor?.trim() || null,
          notes?.trim() || null,
          receiptUrl || null,
          receiptName?.trim() || null,
          user.userId,
        ]
      );

      const created = res.rows[0];
      await auditLog(
        user.userId,
        'create_expense',
        `expense:${created?.id || title}`,
        {
          title,
          amount: numAmount,
          category,
          hasReceipt: !!receiptUrl,
        }
      );

      return reply.status(201).send({
        message: 'Expense added successfully',
        expense: {
          ...created,
          receiptUrl: created.receipt_url || receiptUrl || null,
          receiptName: created.receipt_name || receiptName || null,
        },
      });
    }
  );

  // PUT /api/expenses/:id — edit an expense item
  app.put(
    '/api/expenses/:id',
    { preHandler: [authenticate, requireRole('admin', 'overall')] },
    async (request, reply) => {
      const user = (request as AuthedRequest).user!;
      const { id } = request.params as { id: string };
      const {
        title,
        category,
        amount,
        expenseDate,
        paymentMethod,
        vendor,
        notes,
        receiptUrl,
        receiptName,
      } = request.body as {
        title?: string;
        category?: string;
        amount?: number;
        expenseDate?: string;
        paymentMethod?: string;
        vendor?: string;
        notes?: string;
        receiptUrl?: string | null;
        receiptName?: string | null;
      };

      if (amount !== undefined && (isNaN(Number(amount)) || Number(amount) <= 0)) {
        return reply
          .status(400)
          .send({ error: 'Amount must be a positive number' });
      }

      const res = await query(
        `UPDATE expenses
         SET title = COALESCE($1, title),
             category = COALESCE($2, category),
             amount = COALESCE($3, amount),
             expense_date = COALESCE($4, expense_date),
             payment_method = COALESCE($5, payment_method),
             vendor = COALESCE($6, vendor),
             notes = COALESCE($7, notes),
             receipt_url = COALESCE($8, receipt_url),
             receipt_name = COALESCE($9, receipt_name)
         WHERE id = $10
         RETURNING *`,
        [
          title?.trim(),
          category?.trim(),
          amount !== undefined ? Number(amount) : undefined,
          expenseDate,
          paymentMethod?.toUpperCase().trim(),
          vendor?.trim(),
          notes?.trim(),
          receiptUrl !== undefined ? receiptUrl : undefined,
          receiptName !== undefined ? receiptName : undefined,
          id,
        ]
      );

      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Expense item not found' });
      }

      await auditLog(user.userId, 'update_expense', `expense:${id}`, {
        title,
        amount,
      });

      const updated = res.rows[0];
      return {
        message: 'Expense updated successfully',
        expense: {
          ...updated,
          receiptUrl: updated.receipt_url !== undefined ? updated.receipt_url : receiptUrl,
          receiptName: updated.receipt_name !== undefined ? updated.receipt_name : receiptName,
        },
      };
    }
  );

  // DELETE /api/expenses/:id — delete an expense item
  app.delete(
    '/api/expenses/:id',
    { preHandler: [authenticate, requireRole('admin', 'overall')] },
    async (request, reply) => {
      const user = (request as AuthedRequest).user!;
      const { id } = request.params as { id: string };

      const res = await query(`DELETE FROM expenses WHERE id = $1 RETURNING *`, [
        id,
      ]);

      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Expense item not found' });
      }

      await auditLog(user.userId, 'delete_expense', `expense:${id}`);

      return {
        message: 'Expense deleted successfully',
        deleted: res.rows[0],
      };
    }
  );
}
