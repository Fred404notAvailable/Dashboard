import { format, addDays, parseISO, getDay } from 'date-fns';

export interface DailyDataPoint {
  date: string;
  count: number;
}

export interface ForecastPoint {
  date: string;
  predicted: number;
  lower: number;
  upper: number;
  cumulativePredicted: number;
}

export interface WeeklyPattern {
  day: string; // 'Mon', 'Tue', etc.
  avgCount: number;
  index: number; // relative index vs overall average (1.0 = average)
}

export interface ForecastResult {
  historical: DailyDataPoint[];
  forecast: ForecastPoint[];
  metrics: {
    averageDailyRate: number;
    trendSlope: number;
    rSquared: number;
    projectedTotal: number;
    currentTotal: number;
    goalTarget: number;
    projectedGoalDate: string | null;
    daysUntilGoal: number | null;
    confidenceScore: number;
    momentum: number;         // % change: last 7d avg vs prior 7d avg
    peakDay: string | null;   // e.g. "Saturday"
    slowestDay: string | null;
    weeklyPattern: WeeklyPattern[];
    modelBlend: { linear: number; ets: number; movingAvg: number }; // weights used
  };
}

// ─── OLS Linear Regression ────────────────────────────────────────────────

function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, rSquared: 0, stdErr: 1 };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (const p of points) {
    sumX += p.x; sumY += p.y; sumXY += p.x * p.y;
    sumXX += p.x * p.x; sumYY += p.y * p.y;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;

  let ssRes = 0, ssTot = 0;
  const meanY = sumY / n;
  for (const p of points) {
    const pred = slope * p.x + intercept;
    ssRes += Math.pow(p.y - pred, 2);
    ssTot += Math.pow(p.y - meanY, 2);
  }

  const rSquared = ssTot === 0 ? 1 : Math.max(0, Math.min(1, 1 - ssRes / ssTot));
  const stdErr = Math.sqrt(ssRes / Math.max(1, n - 2)) || 1;
  return { slope, intercept, rSquared, stdErr };
}

// ─── Exponential Smoothing (Simple ETS / Holt's) ─────────────────────────

/**
 * Holt's double exponential smoothing — handles level + trend.
 * Returns a smoothed level and trend to project forward.
 */
function holtsSmoothing(values: number[], alpha = 0.3, beta = 0.1) {
  if (values.length === 0) return { level: 0, trend: 0 };
  if (values.length === 1) return { level: values[0], trend: 0 };

  let level = values[0];
  let trend = values[1] - values[0];

  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return { level, trend };
}

// ─── Day-of-Week Seasonality ─────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function computeWeeklyPattern(data: DailyDataPoint[]): WeeklyPattern[] {
  const buckets: number[][] = [[], [], [], [], [], [], []];
  for (const d of data) {
    try {
      const dow = getDay(parseISO(d.date)); // 0=Sun … 6=Sat
      buckets[dow].push(d.count);
    } catch { /* skip bad dates */ }
  }

  const avgs = buckets.map(b => b.length === 0 ? 0 : b.reduce((s, v) => s + v, 0) / b.length);
  const overall = avgs.reduce((s, v) => s + v, 0) / 7 || 1;

  return DAY_NAMES.map((day, i) => ({
    day,
    avgCount: Math.round(avgs[i] * 10) / 10,
    index: Math.round((avgs[i] / overall) * 100) / 100,
  }));
}

/** Returns the seasonal multiplier for a given date based on day-of-week pattern. */
function seasonalMultiplier(date: Date, pattern: WeeklyPattern[]): number {
  const idx = getDay(date);
  return pattern[idx]?.index ?? 1;
}

// ─── Momentum ────────────────────────────────────────────────────────────

function computeMomentum(sorted: DailyDataPoint[]): number {
  if (sorted.length < 2) return 0;
  const last7 = sorted.slice(-7);
  const prior7 = sorted.slice(-14, -7);
  if (last7.length === 0 || prior7.length === 0) return 0;
  const last7avg = last7.reduce((s, d) => s + d.count, 0) / last7.length;
  const prior7avg = prior7.reduce((s, d) => s + d.count, 0) / prior7.length;
  if (prior7avg === 0) return last7avg > 0 ? 100 : 0;
  return Math.round(((last7avg - prior7avg) / prior7avg) * 100);
}

// ─── Main Forecast Generator ──────────────────────────────────────────────

/**
 * Generates an N-day predictive forecast using a blended 3-model approach:
 *   - Linear OLS trend (40%)
 *   - Holt's ETS double smoothing (40%)
 *   - Rolling moving average (20%)
 * Additionally applies day-of-week seasonality correction.
 */
export function generateForecast(
  historicalData: DailyDataPoint[],
  horizonDays: number = 14,
  goalTarget: number = 500
): ForecastResult {
  const sorted = [...historicalData].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;

  // ── Empty data guard ──────────────────────────────────────────────────
  if (n === 0) {
    const today = new Date();
    const forecast: ForecastPoint[] = [];
    for (let i = 1; i <= horizonDays; i++) {
      const d = format(addDays(today, i), 'yyyy-MM-dd');
      forecast.push({ date: d, predicted: 0, lower: 0, upper: 0, cumulativePredicted: 0 });
    }
    const emptyPattern = DAY_NAMES.map(day => ({ day, avgCount: 0, index: 1 }));
    return {
      historical: [],
      forecast,
      metrics: {
        averageDailyRate: 0, trendSlope: 0, rSquared: 0,
        projectedTotal: 0, currentTotal: 0, goalTarget,
        projectedGoalDate: null, daysUntilGoal: null,
        confidenceScore: 0, momentum: 0,
        peakDay: null, slowestDay: null,
        weeklyPattern: emptyPattern,
        modelBlend: { linear: 0.4, ets: 0.4, movingAvg: 0.2 },
      },
    };
  }

  const currentTotal = sorted.reduce((sum, d) => sum + d.count, 0);
  const avgRate = currentTotal / Math.max(1, n);
  const values = sorted.map(d => d.count);

  // ── Model 1: OLS Linear Regression ───────────────────────────────────
  const regressionPoints = sorted.map((d, i) => ({ x: i, y: d.count }));
  const { slope, intercept, rSquared, stdErr } = linearRegression(regressionPoints);

  // ── Model 2: Holt's ETS ───────────────────────────────────────────────
  const { level: etsLevel, trend: etsTrend } = holtsSmoothing(values);

  // ── Day-of-week pattern ───────────────────────────────────────────────
  const weeklyPattern = computeWeeklyPattern(sorted);
  const patternMax = weeklyPattern.reduce((a, b) => a.avgCount > b.avgCount ? a : b, weeklyPattern[0]);
  const patternMin = weeklyPattern.reduce((a, b) => a.avgCount < b.avgCount ? a : b, weeklyPattern[0]);
  const peakDay   = patternMax.avgCount > 0 ? DAY_FULL[DAY_NAMES.indexOf(patternMax.day)] : null;
  const slowestDay = patternMin.avgCount > 0 ? DAY_FULL[DAY_NAMES.indexOf(patternMin.day)] : null;

  // ── Momentum ──────────────────────────────────────────────────────────
  const momentum = computeMomentum(sorted);

  // ── Forecast Generation ───────────────────────────────────────────────
  const lastDate = parseISO(sorted[n - 1].date);
  const zScore = 1.96; // 95% CI
  const forecast: ForecastPoint[] = [];
  let runningCumulative = currentTotal;

  // Weights — increase ETS weight when we have more data
  const etsBias = Math.min(0.45, 0.2 + (n / 200) * 0.25);
  const linBias = Math.min(0.45, 0.4 - (n / 400) * 0.1);
  const maBias  = Math.max(0.1, 1 - etsBias - linBias);

  for (let i = 1; i <= horizonDays; i++) {
    const futureDate = addDays(lastDate, i);
    const futureDateStr = format(futureDate, 'yyyy-MM-dd');
    const x = n - 1 + i;

    // Model 1: linear
    const linearPred = Math.max(0, slope * x + intercept);
    // Model 2: ETS projection
    const etsPred = Math.max(0, etsLevel + etsTrend * i);
    // Model 3: moving average (last 7-day avg)
    const maPred = avgRate;

    // Blend
    const rawBlend = linearPred * linBias + etsPred * etsBias + maPred * maBias;

    // Apply day-of-week seasonality
    const seasonal = seasonalMultiplier(futureDate, weeklyPattern);
    // Only apply if we have enough history for reliable pattern
    const seasonalAdjusted = n >= 14 ? rawBlend * seasonal : rawBlend;
    const blendedPred = Math.max(0, Math.round(seasonalAdjusted));

    // Confidence bands widen with forecast distance
    const uncertaintyFactor = Math.sqrt(1 + i / n);
    const margin = Math.round(zScore * stdErr * uncertaintyFactor);

    runningCumulative += blendedPred;

    forecast.push({
      date: futureDateStr,
      predicted: blendedPred,
      lower: Math.max(0, blendedPred - margin),
      upper: blendedPred + margin,
      cumulativePredicted: runningCumulative,
    });
  }

  // ── Goal Date Projection ──────────────────────────────────────────────
  let projectedGoalDate: string | null = null;
  let daysUntilGoal: number | null = null;
  const needed = goalTarget - currentTotal;

  if (needed <= 0) {
    projectedGoalDate = 'Goal Reached';
    daysUntilGoal = 0;
  } else {
    // Find first forecast point where cumulative >= goal
    const hitPoint = forecast.find(f => f.cumulativePredicted >= goalTarget);
    if (hitPoint) {
      projectedGoalDate = hitPoint.date;
      daysUntilGoal = forecast.indexOf(hitPoint) + 1;
    } else if (avgRate > 0) {
      const extra = Math.ceil(needed / Math.max(0.1, avgRate));
      projectedGoalDate = format(addDays(lastDate, extra), 'yyyy-MM-dd');
      daysUntilGoal = extra;
    }
  }

  const confidenceScore = isNaN(rSquared) ? 75 : Math.round(rSquared * 100);

  return {
    historical: sorted,
    forecast,
    metrics: {
      averageDailyRate: Math.round(avgRate * 10) / 10,
      trendSlope: Math.round(slope * 100) / 100,
      rSquared: Math.round(rSquared * 1000) / 1000,
      projectedTotal: runningCumulative,
      currentTotal,
      goalTarget,
      projectedGoalDate,
      daysUntilGoal,
      confidenceScore,
      momentum,
      peakDay,
      slowestDay,
      weeklyPattern,
      modelBlend: {
        linear: Math.round(linBias * 100) / 100,
        ets: Math.round(etsBias * 100) / 100,
        movingAvg: Math.round(maBias * 100) / 100,
      },
    },
  };
}
