import {
  startOfMonth, endOfMonth, startOfQuarter, startOfYear,
  subDays, subMonths, format, differenceInDays, parseISO
} from 'date-fns';

export type Preset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'ytd';

export function resolvePreset(preset: Preset, now = new Date()): { start: string; end: string } {
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

  switch (preset) {
    case 'today':
      return { start: fmt(now), end: fmt(now) };
    case 'yesterday': {
      const d = subDays(now, 1);
      return { start: fmt(d), end: fmt(d) };
    }
    case 'last7':
      return { start: fmt(subDays(now, 6)), end: fmt(now) };
    case 'last30':
      return { start: fmt(subDays(now, 29)), end: fmt(now) };
    case 'thisMonth':
      return { start: fmt(startOfMonth(now)), end: fmt(now) };
    case 'lastMonth': {
      const lm = subMonths(now, 1);
      return { start: fmt(startOfMonth(lm)), end: fmt(endOfMonth(lm)) };
    }
    case 'thisQuarter':
      return { start: fmt(startOfQuarter(now)), end: fmt(now) };
    case 'ytd':
      return { start: fmt(startOfYear(now)), end: fmt(now) };
  }
}

/**
 * Calculate the previous period of equal length for comparison.
 * E.g., if current range is Aug 1-15 (15 days), previous is Jul 17-31.
 */
export function previousPeriod(start: string, end: string): { start: string; end: string } {
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  const days = differenceInDays(endDate, startDate) + 1;
  return {
    start: format(subDays(startDate, days), 'yyyy-MM-dd'),
    end: format(subDays(startDate, 1), 'yyyy-MM-dd'),
  };
}

export function formatDateForDisplay(dateStr: string): string {
  const d = parseISO(dateStr);
  return format(d, 'dd MMM yyyy');
}
