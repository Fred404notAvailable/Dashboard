import { describe, it, expect } from 'vitest';
import { generateForecast, DailyDataPoint } from '../src/services/forecastService.js';

describe('forecastService', () => {
  it('should generate N-day forecast with confidence bands for linear historical trend', () => {
    const historical: DailyDataPoint[] = [
      { date: '2026-08-18', count: 10 },
      { date: '2026-08-19', count: 12 },
      { date: '2026-08-20', count: 15 },
      { date: '2026-08-21', count: 18 },
      { date: '2026-08-22', count: 20 },
      { date: '2026-08-23', count: 22 },
      { date: '2026-08-24', count: 25 },
      { date: '2026-08-25', count: 28 },
    ];

    const result = generateForecast(historical, 14, 500);

    expect(result.historical).toHaveLength(8);
    expect(result.forecast).toHaveLength(14);
    expect(result.metrics.averageDailyRate).toBeGreaterThan(15);
    expect(result.metrics.trendSlope).toBeGreaterThan(0);
    expect(result.metrics.confidenceScore).toBeGreaterThanOrEqual(80);

    // Each forecast point should have predicted, lower, and upper bounds
    for (const point of result.forecast) {
      expect(point.predicted).toBeGreaterThanOrEqual(0);
      expect(point.lower).toBeLessThanOrEqual(point.predicted);
      expect(point.upper).toBeGreaterThanOrEqual(point.predicted);
      expect(point.cumulativePredicted).toBeGreaterThan(150);
    }
  });

  it('should handle empty historical data gracefully without throwing errors', () => {
    const result = generateForecast([], 7, 500);

    expect(result.historical).toHaveLength(0);
    expect(result.forecast).toHaveLength(7);
    expect(result.metrics.projectedTotal).toBe(0);
    expect(result.metrics.projectedGoalDate).toBeNull();
  });

  it('should detect when registration goal is already reached', () => {
    const historical: DailyDataPoint[] = [
      { date: '2026-08-18', count: 300 },
      { date: '2026-08-19', count: 250 },
    ];

    const result = generateForecast(historical, 7, 500);
    expect(result.metrics.projectedGoalDate).toBe('Goal Reached');
  });
});
