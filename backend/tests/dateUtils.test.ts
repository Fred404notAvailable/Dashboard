import { describe, it, expect } from 'vitest';
import { resolvePreset, previousPeriod, formatDateForDisplay } from '../src/services/dateUtils.js';

describe('dateUtils', () => {
  const fixedNow = new Date('2026-08-25T12:00:00Z');

  describe('resolvePreset', () => {
    it('should resolve "today" preset correctly', () => {
      const { start, end } = resolvePreset('today', fixedNow);
      expect(start).toBe('2026-08-25');
      expect(end).toBe('2026-08-25');
    });

    it('should resolve "yesterday" preset correctly', () => {
      const { start, end } = resolvePreset('yesterday', fixedNow);
      expect(start).toBe('2026-08-24');
      expect(end).toBe('2026-08-24');
    });

    it('should resolve "last7" preset correctly (7 days inclusive)', () => {
      const { start, end } = resolvePreset('last7', fixedNow);
      expect(start).toBe('2026-08-19');
      expect(end).toBe('2026-08-25');
    });

    it('should resolve "last30" preset correctly (30 days inclusive)', () => {
      const { start, end } = resolvePreset('last30', fixedNow);
      expect(start).toBe('2026-07-27');
      expect(end).toBe('2026-08-25');
    });

    it('should resolve "thisMonth" preset correctly', () => {
      const { start, end } = resolvePreset('thisMonth', fixedNow);
      expect(start).toBe('2026-08-01');
      expect(end).toBe('2026-08-25');
    });

    it('should resolve "lastMonth" preset correctly', () => {
      const { start, end } = resolvePreset('lastMonth', fixedNow);
      expect(start).toBe('2026-07-01');
      expect(end).toBe('2026-07-31');
    });

    it('should resolve "ytd" preset correctly', () => {
      const { start, end } = resolvePreset('ytd', fixedNow);
      expect(start).toBe('2026-01-01');
      expect(end).toBe('2026-08-25');
    });
  });

  describe('previousPeriod', () => {
    it('should calculate previous period of equal duration for like-for-like comparison', () => {
      // Range: 2026-08-01 to 2026-08-15 (15 days)
      // Previous: 2026-07-17 to 2026-07-31 (15 days)
      const prev = previousPeriod('2026-08-01', '2026-08-15');
      expect(prev.start).toBe('2026-07-17');
      expect(prev.end).toBe('2026-07-31');
    });

    it('should calculate previous single day for 1-day range', () => {
      const prev = previousPeriod('2026-08-25', '2026-08-25');
      expect(prev.start).toBe('2026-08-24');
      expect(prev.end).toBe('2026-08-24');
    });
  });

  describe('formatDateForDisplay', () => {
    it('should format ISO date strings into readable human format', () => {
      expect(formatDateForDisplay('2026-08-25')).toBe('25 Aug 2026');
    });
  });
});
