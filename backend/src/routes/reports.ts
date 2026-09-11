import { FastifyInstance } from 'fastify';
import { query } from '../database/db.js';
import { authenticate, requireRole, AuthedRequest } from '../middleware/auth.js';
import { resolvePreset, previousPeriod, Preset } from '../services/dateUtils.js';
import { format } from 'date-fns';
import { withCache } from '../services/cache.js';

export async function reportRoutes(app: FastifyInstance) {
  // GET /api/reports/summary — aggregated stats for a date range
  app.get('/api/reports/summary', { preHandler: [authenticate] }, async (request) => {
    const { start, end, preset } = request.query as { start?: string; end?: string; preset?: Preset };

    let dateRange: { start: string; end: string };
    if (preset) {
      dateRange = resolvePreset(preset);
    } else if (start && end) {
      dateRange = { start, end };
    } else {
      dateRange = resolvePreset('today');
    }
    const user = (request as AuthedRequest).user;
    const hasFinancialAccess = user?.role === 'admin' || user?.role === 'overall';
    const cacheKey = `report:summary:${dateRange.start}:${dateRange.end}:${hasFinancialAccess ? 'fin' : 'gen'}`;
    return withCache(cacheKey, async () => {
    // Total counts by registration type
    const totalResult = await query(
      `SELECT registration_type, COUNT(*) as count
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2
       GROUP BY registration_type`,
      [dateRange.start, dateRange.end]
    );

    const type200 = parseInt(totalResult.rows.find(r => r.registration_type === 200)?.count || '0');
    const type250 = parseInt(totalResult.rows.find(r => r.registration_type === 250)?.count || '0');
    const total = type200 + type250;

    // Previous period for delta
    const prev = previousPeriod(dateRange.start, dateRange.end);
    const prevResult = await query(
      `SELECT COUNT(*) as count FROM registrations
       WHERE registration_date BETWEEN $1 AND $2`,
      [prev.start, prev.end]
    );
    const prevTotal = parseInt(prevResult.rows[0]?.count || '0');
    const delta = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : total > 0 ? 100 : 0;

    // Payment method breakdown
    const paymentResult = await query(
      `SELECT payment_method, COUNT(*) as count
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2
       GROUP BY payment_method ORDER BY count DESC`,
      [dateRange.start, dateRange.end]
    );

    // Department breakdown
    const deptResult = await query(
      `SELECT department, COUNT(*) as count
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2
       GROUP BY department ORDER BY count DESC`,
      [dateRange.start, dateRange.end]
    );

    // Year-wise breakdown
    const yearResult = await query(
      `SELECT year, COUNT(*) as count
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2
       GROUP BY year ORDER BY year`,
      [dateRange.start, dateRange.end]
    );

    // School-wise breakdown with type split
    const schoolResult = await query(
      `SELECT school, registration_type, COUNT(*) as count
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2
       GROUP BY school, registration_type ORDER BY school`,
      [dateRange.start, dateRange.end]
    );

    // Event popularity (count across event_1, event_2, event_3)
    const eventResult = await query(
      `SELECT event_name, COUNT(*) as count FROM (
        SELECT event_1 as event_name FROM registrations WHERE registration_date BETWEEN $1 AND $2 AND event_1 IS NOT NULL AND event_1 != ''
        UNION ALL
        SELECT event_2 FROM registrations WHERE registration_date BETWEEN $1 AND $2 AND event_2 IS NOT NULL AND event_2 != ''
        UNION ALL
        SELECT event_3 FROM registrations WHERE registration_date BETWEEN $1 AND $2 AND event_3 IS NOT NULL AND event_3 != ''
       ) events
       GROUP BY event_name ORDER BY count DESC`,
      [dateRange.start, dateRange.end]
    );

    // Event combinations
    const comboResult = await query(
      `SELECT
        CASE
          WHEN event_3 IS NOT NULL AND event_3 != '' THEN event_1 || ' + ' || event_2 || ' + ' || event_3
          WHEN event_2 IS NOT NULL AND event_2 != '' THEN event_1 || ' + ' || event_2
          ELSE event_1
        END as combo,
        COUNT(*) as count
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2 AND event_1 IS NOT NULL AND event_1 != ''
       GROUP BY combo ORDER BY count DESC LIMIT 10`,
      [dateRange.start, dateRange.end]
    );

    // Daily volume trend
    const dailyResult = await query(
      `SELECT registration_date, registration_type, COUNT(*) as count
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2
       GROUP BY registration_date, registration_type
       ORDER BY registration_date`,
      [dateRange.start, dateRange.end]
    );

    // Cumulative totals
    const cumulativeResult = await query(
      `SELECT registration_date, COUNT(*) as count,
        SUM(COUNT(*)) OVER (ORDER BY registration_date) as cumulative
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2
       GROUP BY registration_date ORDER BY registration_date`,
      [dateRange.start, dateRange.end]
    );

    // Revenue calculations (only if authorized)
    const revenue200 = type200 * 200;
    const revenue250 = type250 * 250;
    const totalRevenue = revenue200 + revenue250;

    // Revenue by payment method
    const revenueByPaymentResult = await query(
      `SELECT payment_method, registration_type, COUNT(*) as count
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2
       GROUP BY payment_method, registration_type`,
      [dateRange.start, dateRange.end]
    );

    const revenueByPayment: Record<string, number> = {};
    if (hasFinancialAccess) {
      for (const row of revenueByPaymentResult.rows) {
        const method = row.payment_method || 'Unknown';
        const rev = parseInt(row.count) * row.registration_type;
        revenueByPayment[method] = (revenueByPayment[method] || 0) + rev;
      }
    }

    // Missing data counts
    const missingMobile = await query(
      `SELECT COUNT(*) as count FROM registrations
       WHERE registration_date BETWEEN $1 AND $2 AND (mobile_no IS NULL OR mobile_no = '')`,
      [dateRange.start, dateRange.end]
    );
    const missingPayment = await query(
      `SELECT COUNT(*) as count FROM registrations
       WHERE registration_date BETWEEN $1 AND $2 AND (payment_method IS NULL OR payment_method = '')`,
      [dateRange.start, dateRange.end]
    );

    // Cross-tier duplicate registrations
    const duplicateResult = await query(
      `SELECT registrant_name, mobile_no, COUNT(DISTINCT registration_type) as tier_count
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2
       AND mobile_no IS NOT NULL AND mobile_no != ''
       GROUP BY registrant_name, mobile_no
       HAVING COUNT(DISTINCT registration_type) > 1`,
      [dateRange.start, dateRange.end]
    );

    // Registration velocity
    const velocityResult = await query(
      `SELECT registration_date, COUNT(*) as count
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2
       GROUP BY registration_date ORDER BY registration_date DESC LIMIT 7`,
      [dateRange.start, dateRange.end]
    );

    // Goal tracker
    const goalResult = await query(`SELECT COUNT(*) as count FROM registrations`);
    const goalTotal = parseInt(goalResult.rows[0]?.count || '0');
    let goalTarget = 500;
    try {
      const goalSetting = await query(`SELECT value FROM app_settings WHERE key = 'registration_goal'`);
      if (goalSetting.rows[0]?.value) {
        goalTarget = parseInt(goalSetting.rows[0].value, 10) || 500;
      }
    } catch {}

    // Process school-wise data
    const schoolMap: Record<string, { type200: number; type250: number }> = {};
    for (const row of schoolResult.rows) {
      const school = row.school || 'Unknown';
      if (!schoolMap[school]) schoolMap[school] = { type200: 0, type250: 0 };
      if (row.registration_type === 200) schoolMap[school].type200 = parseInt(row.count);
      else schoolMap[school].type250 = parseInt(row.count);
    }

    // Process daily volume
    const safeFormatDate = (raw: any): string => {
      if (!raw) return 'Unknown';
      if (typeof raw === 'string') {
        const cleaned = raw.split('T')[0].trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
      }
      try {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return format(d, 'yyyy-MM-dd');
      } catch {}
      return String(raw);
    };

    const dailyMap: Record<string, { date: string; type200: number; type250: number; total: number }> = {};
    for (const row of dailyResult.rows) {
      const dateKey = row.registration_date || row.date;
      const date = safeFormatDate(dateKey);
      if (!dailyMap[date]) dailyMap[date] = { date, type200: 0, type250: 0, total: 0 };
      if (row.registration_type === 200) dailyMap[date].type200 = parseInt(row.count || '0');
      else dailyMap[date].type250 = parseInt(row.count || '0');
      dailyMap[date].total = dailyMap[date].type200 + dailyMap[date].type250;
    }

    return {
      dateRange,
      summary: {
        total,
        type200,
        type250,
        delta: Math.round(delta * 10) / 10,
        previousTotal: prevTotal,
      },
      revenue: hasFinancialAccess
        ? {
            total: totalRevenue,
            type200: revenue200,
            type250: revenue250,
            byPaymentMethod: revenueByPayment,
            isRestricted: false,
          }
        : {
            total: null,
            type200: null,
            type250: null,
            byPaymentMethod: {},
            isRestricted: true,
          },
      paymentBreakdown: paymentResult.rows.map(r => ({
        method: r.payment_method || 'Unknown',
        count: parseInt(r.count),
      })),
      departmentBreakdown: deptResult.rows.map(r => ({
        department: r.department || 'Unknown',
        count: parseInt(r.count),
      })),
      yearBreakdown: yearResult.rows.map(r => ({
        year: r.year || 'Unknown',
        count: parseInt(r.count),
      })),
      schoolComparison: Object.entries(schoolMap).map(([school, data]) => ({
        school,
        type200: data.type200,
        type250: data.type250,
        total: data.type200 + data.type250,
        revenue: hasFinancialAccess ? (data.type200 * 200 + data.type250 * 250) : null,
      })),
      eventPopularity: eventResult.rows.map(r => ({
        event: r.event_name,
        count: parseInt(r.count),
        percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 1000) / 10 : 0,
      })),
      eventCombinations: comboResult.rows.map(r => ({
        combination: r.combo,
        count: parseInt(r.count),
      })),
      dailyVolume: Object.values(dailyMap),
      cumulativeGrowth: cumulativeResult.rows.map(r => ({
        date: safeFormatDate(r.registration_date || r.date),
        count: parseInt(r.count || '0'),
        cumulative: parseInt(r.cumulative || '0'),
      })),
      dataQuality: {
        missingMobile: parseInt(missingMobile.rows[0]?.count || '0'),
        missingPayment: parseInt(missingPayment.rows[0]?.count || '0'),
        duplicates: duplicateResult.rows.map(r => ({
          name: r.registrant_name,
          mobile: r.mobile_no,
        })),
      },
      velocity: velocityResult.rows.map(r => ({
        date: safeFormatDate(r.registration_date || r.date),
        count: parseInt(r.count || '0'),
      })),
      goal: {
        target: goalTarget,
        current: goalTotal,
        percentage: Math.round((goalTotal / goalTarget) * 1000) / 10,
        remaining: Math.max(0, goalTarget - goalTotal),
      },
    };
    }, 300); // 5-minute cache TTL
  });

  // GET /api/reports/registrations — paginated raw data
  app.get('/api/registrations', { preHandler: [authenticate, requireRole('admin', 'analyst')] }, async (request) => {
    const {
      start, end, preset, type, department, school, year, event, payment,
      page = '1', pageSize = '50', cursor
    } = request.query as Record<string, string>;

    let dateRange: { start: string; end: string };
    if (preset) {
      dateRange = resolvePreset(preset as Preset);
    } else if (start && end) {
      dateRange = { start, end };
    } else {
      dateRange = resolvePreset('thisMonth');
    }

    const conditions: string[] = ['registration_date BETWEEN $1 AND $2'];
    const params: any[] = [dateRange.start, dateRange.end];
    let paramIndex = 3;

    if (type) {
      conditions.push(`registration_type = $${paramIndex}`);
      params.push(parseInt(type));
      paramIndex++;
    }
    if (department) {
      conditions.push(`department = $${paramIndex}`);
      params.push(department);
      paramIndex++;
    }
    if (school) {
      conditions.push(`school = $${paramIndex}`);
      params.push(school);
      paramIndex++;
    }
    if (year) {
      conditions.push(`year = $${paramIndex}`);
      params.push(year);
      paramIndex++;
    }
    if (payment) {
      conditions.push(`payment_method = $${paramIndex}`);
      params.push(payment);
      paramIndex++;
    }
    if (event) {
      conditions.push(`(event_1 = $${paramIndex} OR event_2 = $${paramIndex} OR event_3 = $${paramIndex})`);
      params.push(event);
      paramIndex++;
    }

    const where = conditions.join(' AND ');
    const limit = Math.min(parseInt(pageSize) || 50, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM registrations WHERE ${where}`,
      params
    );
    const totalRows = parseInt(countResult.rows[0]?.total || '0');

    const result = await query(
      `SELECT id, s_no, registrant_name, reg_no, year, department, school, mobile_no,
              event_1, event_2, event_3, payment_method, registration_type, registration_date, synced_at
       FROM registrations
       WHERE ${where}
       ORDER BY registration_date DESC, s_no ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      data: result.rows.map(r => ({
        id: r.id,
        sNo: r.s_no,
        name: r.registrant_name,
        regNo: r.reg_no,
        year: r.year,
        department: r.department,
        school: r.school,
        mobileNo: r.mobile_no,
        event1: r.event_1,
        event2: r.event_2,
        event3: r.event_3,
        paymentMethod: r.payment_method,
        registrationType: r.registration_type,
        registrationDate: r.registration_date,
        syncedAt: r.synced_at,
      })),
      pagination: {
        page: Math.max(parseInt(page) || 1, 1),
        pageSize: limit,
        totalRows,
        totalPages: Math.ceil(totalRows / limit),
      },
      filters: { dateRange, type, department, school, year, event, payment },
    };
  });

  // GET /api/reports/recent — last N registrations for live feed
  app.get('/api/reports/recent', { preHandler: [authenticate] }, async (request) => {
    const { limit = '10' } = request.query as { limit?: string };
    const result = await query(
      `SELECT registrant_name, reg_no, department, event_1, event_2, event_3, registration_type, registration_date, synced_at
       FROM registrations
       ORDER BY synced_at DESC LIMIT $1`,
      [Math.min(parseInt(limit), 50)]
    );

    return result.rows.map(r => ({
      name: r.registrant_name,
      regNo: r.reg_no,
      department: r.department,
      events: [r.event_1, r.event_2, r.event_3].filter(Boolean),
      type: r.registration_type,
      date: r.registration_date,
      syncedAt: r.synced_at,
    }));
  });

  // GET /api/reports/event-participants — participants for a specific event
  app.get('/api/reports/event-participants', { preHandler: [authenticate] }, async (request) => {
    const { event, start, end, preset } = request.query as { event: string; start?: string; end?: string; preset?: Preset };

    if (!event) {
      return { error: 'Event name is required' };
    }

    let dateRange: { start: string; end: string };
    if (preset) dateRange = resolvePreset(preset);
    else if (start && end) dateRange = { start, end };
    else dateRange = resolvePreset('thisMonth');

    const result = await query(
      `SELECT registrant_name, reg_no, year, department, school, registration_type
       FROM registrations
       WHERE registration_date BETWEEN $1 AND $2
       AND (event_1 = $3 OR event_2 = $3 OR event_3 = $3)
       ORDER BY department, registrant_name`,
      [dateRange.start, dateRange.end, event]
    );

    return {
      event,
      dateRange,
      total: result.rows.length,
      participants: result.rows.map(r => ({
        name: r.registrant_name,
        regNo: r.reg_no,
        year: r.year,
        department: r.department,
        school: r.school,
        type: r.registration_type,
      })),
    };
  });

  // ── GET /api/reports/dept-insights ───────────────────────────────────────
  // Returns a focus-score for every department — surfacing which need attention.
  // Signals: count share, recent trend, tier-250 rate, avg events per registrant.
  app.get(
    '/api/reports/dept-insights',
    { preHandler: [authenticate, requireRole('admin', 'overall', 'analyst')] },
    async (request) => {
      const { start, end, preset } = request.query as { start?: string; end?: string; preset?: Preset };

      let dateRange: { start: string; end: string };
      if (preset) dateRange = resolvePreset(preset);
      else if (start && end) dateRange = { start, end };
      else dateRange = resolvePreset('all');

      const cacheKey = `dept-insights:${dateRange.start}:${dateRange.end}`;
      return withCache(cacheKey, async () => {
        // ── 1. Current period per-department stats ──
        const currentResult = await query(
          `SELECT
             department,
             COUNT(*) as total,
             SUM(CASE WHEN registration_type = 250 THEN 1 ELSE 0 END) as tier250,
             SUM(
               (CASE WHEN event_1 IS NOT NULL AND event_1 != '' THEN 1 ELSE 0 END) +
               (CASE WHEN event_2 IS NOT NULL AND event_2 != '' THEN 1 ELSE 0 END) +
               (CASE WHEN event_3 IS NOT NULL AND event_3 != '' THEN 1 ELSE 0 END)
             )::float / NULLIF(COUNT(*), 0) as avg_events
           FROM registrations
           WHERE registration_date BETWEEN $1 AND $2
             AND department IS NOT NULL AND department != ''
           GROUP BY department
           ORDER BY total DESC`,
          [dateRange.start, dateRange.end]
        );

        if (currentResult.rows.length === 0) {
          return { success: true, dateRange, insights: [] };
        }

        // ── 2. Split period into two halves to compute trend ──
        const startD = new Date(dateRange.start);
        const endD   = new Date(dateRange.end);
        const midD   = new Date((startD.getTime() + endD.getTime()) / 2);
        const midStr = format(midD, 'yyyy-MM-dd');

        const [recentResult, priorResult] = await Promise.all([
          query(
            `SELECT department, COUNT(*) as count
             FROM registrations
             WHERE registration_date BETWEEN $1 AND $2
               AND department IS NOT NULL AND department != ''
             GROUP BY department`,
            [midStr, dateRange.end]
          ),
          query(
            `SELECT department, COUNT(*) as count
             FROM registrations
             WHERE registration_date BETWEEN $1 AND $2
               AND department IS NOT NULL AND department != ''
             GROUP BY department`,
            [dateRange.start, midStr]
          ),
        ]);

        const recentMap = new Map<string, number>(
          recentResult.rows.map((r: any) => [r.department, parseInt(r.count, 10)])
        );
        const priorMap = new Map<string, number>(
          priorResult.rows.map((r: any) => [r.department, parseInt(r.count, 10)])
        );

        // ── 3. Global averages for normalisation ──
        const allRows = currentResult.rows;
        const totalRegistrations = allRows.reduce((s: number, r: any) => s + parseInt(r.total || '0', 10), 0);
        const globalTier250Rate  = allRows.reduce((s: number, r: any) => s + parseInt(r.tier250 || '0', 10), 0) / Math.max(1, totalRegistrations) * 100;
        const globalAvgEvents    = allRows.reduce((s: number, r: any) => s + parseFloat(r.avg_events || '0'), 0) / Math.max(1, allRows.length);
        const avgCountPerDept    = totalRegistrations / Math.max(1, allRows.length);

        // ── 4. Score each department ──
        const insights = allRows.map((r: any) => {
          const dept    = (r.department || 'Unknown') as string;
          const total   = parseInt(r.total || '0', 10);
          const tier250 = parseInt(r.tier250 || '0', 10);
          const avgEvt  = parseFloat(r.avg_events || '0');

          const recent = recentMap.get(dept) ?? 0;
          const prior  = priorMap.get(dept) ?? 0;
          
          // Realistic trend calculation: only calculate high % if there's meaningful volume
          let trend: number;
          if (prior > 0) {
            trend = Math.round(((recent - prior) / prior) * 100);
          } else if (recent > 2) {
            trend = 100;
          } else if (recent > 0) {
            trend = recent * 25; // small trace volume (1-2 regs) is not 100% breakout momentum
          } else {
            trend = 0;
          }

          const tier250Rate = total > 0 ? Math.round((tier250 / total) * 100) : 0;

          // Severity markers
          const isCriticallyLow = total <= Math.max(3, Math.round(avgCountPerDept * 0.25));
          const isBelowAverage = total < avgCountPerDept;
          const isLowPremium = tier250Rate < (globalTier250Rate - 10);

          // Signal scores (0–100 each, higher = more focus / urgency needed)
          const countScore  = isCriticallyLow
            ? Math.max(85, Math.min(100, Math.round((1 - total / (avgCountPerDept * 2)) * 100)))
            : Math.max(0, Math.min(100, Math.round((1 - total / (avgCountPerDept * 2)) * 100)));
          const trendScore  = total <= 3 ? 40 : (trend >= 0 ? 0 : Math.min(100, Math.abs(trend)));
          const tierScore   = Math.max(0, Math.min(100, Math.round((globalTier250Rate - tier250Rate) * 2)));
          const eventScore  = Math.max(0, Math.min(100, Math.round((globalAvgEvents - avgEvt) * 33)));

          // Weighted composite focus score (0-100)
          const focusScore = Math.max(0, Math.min(100, Math.round(
            countScore * 0.40 +
            trendScore * 0.25 +
            tierScore  * 0.20 +
            eventScore * 0.15
          )));

          // Status classification & actionable plain-English recommendations
          let status: 'critical' | 'opportunity' | 'on-track';
          let reason: string;

          if (isCriticallyLow || (trend <= -20 && isBelowAverage) || focusScore >= 50) {
            status = 'critical';
            reason = isCriticallyLow
              ? `Critically low turnout (${total} vs ${Math.round(avgCountPerDept)} dept avg) — deploy student reps for direct classroom outreach`
              : trend < 0
              ? `Sharp registration decline (${trend}% trend) with below-average total (${total})`
              : `High urgency score (${focusScore}/100) — requires immediate promotional focus`;
          } else if (isLowPremium && total >= 15) {
            status = 'opportunity';
            reason = `High turnout (${total} regs) but only ${tier250Rate}% on ₹250 tier (${tier250} regs) — prime target for all-access event upsell`;
          } else if (focusScore >= 25 || isBelowAverage || isLowPremium) {
            status = 'opportunity';
            reason = isBelowAverage
              ? `Moderate turnout (${total} of ${Math.round(avgCountPerDept)} avg) — potential to double with departmental announcements`
              : `Steady participation (${total} regs) — targeted messaging can push engagement higher`;
          } else {
            status = 'on-track';
            reason = `Top performer (${total} regs, ${tier250Rate}% premium) — strong momentum; leverage as benchmark model`;
          }

          return {
            department: dept,
            total,
            tier250,
            tier250Rate,
            avgEvents: Math.round(avgEvt * 10) / 10,
            trend,
            recentCount: recent,
            priorCount: prior,
            focusScore,
            status,
            reason,
          };
        });

        // Sort: critical first, then opportunity, then on-track; within each by focusScore desc
        const order = { critical: 0, opportunity: 1, 'on-track': 2 };
        insights.sort((a: any, b: any) =>
          order[a.status as keyof typeof order] - order[b.status as keyof typeof order] ||
          b.focusScore - a.focusScore
        );

        return {
          success: true,
          dateRange,
          globalAvgTier250Rate: Math.round(globalTier250Rate || 0),
          globalAvgEvents: Math.round((globalAvgEvents || 0) * 10) / 10,
          avgCountPerDept: Math.round(avgCountPerDept || 0),
          insights,
        };
      }, 300);
    }
  );
}
