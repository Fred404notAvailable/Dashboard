import { format, addDays, parseISO } from 'date-fns';

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
    confidenceScore: number;
  };
}

/**
 * Computes OLS linear regression and standard error on historical data
 */
function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) {
    return { slope: 0, intercept: points[0]?.y ?? 0, rSquared: 0, stdErr: 1 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
    sumYY += p.y * p.y;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R^2 and Standard Error
  let ssRes = 0;
  let ssTot = 0;
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

/**
 * Generates an N-day predictive forecast based on historical daily counts
 */
export function generateForecast(
  historicalData: DailyDataPoint[],
  horizonDays: number = 14,
  goalTarget: number = 500
): ForecastResult {
  const sorted = [...historicalData].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;

  if (n === 0) {
    const today = new Date();
    const forecast: ForecastPoint[] = [];
    for (let i = 1; i <= horizonDays; i++) {
      const d = format(addDays(today, i), 'yyyy-MM-dd');
      forecast.push({ date: d, predicted: 0, lower: 0, upper: 0, cumulativePredicted: 0 });
    }
    return {
      historical: [],
      forecast,
      metrics: {
        averageDailyRate: 0,
        trendSlope: 0,
        rSquared: 0,
        projectedTotal: 0,
        currentTotal: 0,
        goalTarget,
        projectedGoalDate: null,
        confidenceScore: 0,
      },
    };
  }

  const currentTotal = sorted.reduce((sum, d) => sum + d.count, 0);
  const avgRate = currentTotal / Math.max(1, n);

  // Prepare regression points (x = day index, y = daily registrations)
  const regressionPoints = sorted.map((d, index) => ({ x: index, y: d.count }));
  const { slope, intercept, rSquared, stdErr } = linearRegression(regressionPoints);

  // Confidence multiplier (95% CI ~ 1.96)
  const zScore = 1.96;
  const lastDate = parseISO(sorted[sorted.length - 1].date);

  const forecast: ForecastPoint[] = [];
  let runningCumulative = currentTotal;

  for (let i = 1; i <= horizonDays; i++) {
    const futureDate = format(addDays(lastDate, i), 'yyyy-MM-dd');
    const x = n - 1 + i;

    // Linear projection blended with recent moving average
    const linearPred = Math.max(0, slope * x + intercept);
    const blendedPred = Math.round(linearPred * 0.7 + avgRate * 0.3);

    // Confidence bands widen slightly with distance into future
    const uncertaintyFactor = Math.sqrt(1 + i / n);
    const margin = Math.round(zScore * stdErr * uncertaintyFactor);

    const lower = Math.max(0, blendedPred - margin);
    const upper = blendedPred + margin;

    runningCumulative += blendedPred;

    forecast.push({
      date: futureDate,
      predicted: blendedPred,
      lower,
      upper,
      cumulativePredicted: runningCumulative,
    });
  }

  // Estimate Goal Completion Date
  let projectedGoalDate: string | null = null;
  const needed = goalTarget - currentTotal;
  if (needed <= 0) {
    projectedGoalDate = 'Goal Reached';
  } else if (avgRate > 0) {
    const daysToGoal = Math.ceil(needed / Math.max(0.1, avgRate));
    projectedGoalDate = format(addDays(lastDate, daysToGoal), 'yyyy-MM-dd');
  }

  const confidenceScore = Math.round(rSquared * 100);

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
      confidenceScore: isNaN(confidenceScore) ? 75 : confidenceScore,
    },
  };
}
