import { describe, it, expect } from 'vitest';
import {
  parseCsvLine,
  parseSheetDate,
  validateRow,
  hashRow,
} from '../src/services/sheetsClient.js';

describe('sheetsClient validation and parsing', () => {
  describe('parseCsvLine', () => {
    it('should parse standard comma-separated fields', () => {
      const line = '1, 2026-08-18, Rahul Kumar, REG001, 2nd, CSE';
      const parsed = parseCsvLine(line);
      expect(parsed).toEqual(['1', '2026-08-18', 'Rahul Kumar', 'REG001', '2nd', 'CSE']);
    });

    it('should parse quoted fields containing commas correctly', () => {
      const line = '1, 2026-08-18, "Kumar, Rahul", REG001, "School of Engineering, Chennai"';
      const parsed = parseCsvLine(line);
      expect(parsed).toEqual(['1', '2026-08-18', 'Kumar, Rahul', 'REG001', 'School of Engineering, Chennai']);
    });
  });

  describe('parseSheetDate', () => {
    it('should recognize ISO YYYY-MM-DD', () => {
      expect(parseSheetDate('2026-08-25')).toBe('2026-08-25');
    });

    it('should parse DD/MM/YYYY format', () => {
      expect(parseSheetDate('25/08/2026')).toBe('2026-08-25');
    });

    it('should parse DD-MM-YYYY format', () => {
      expect(parseSheetDate('25-08-2026')).toBe('2026-08-25');
    });

    it('should return null for invalid date strings', () => {
      expect(parseSheetDate('not-a-date')).toBeNull();
      expect(parseSheetDate('')).toBeNull();
      expect(parseSheetDate(undefined)).toBeNull();
    });
  });

  describe('validateRow', () => {
    it('should successfully validate a complete registration row for ₹200 tier', () => {
      const values = [
        '1', '2026-08-18', 'Rahul Kumar', 'REG2026001', '2nd',
        'CSE', 'School of Engineering', '9876543210', 'Quiz', 'Coding', '', 'UPI'
      ];
      const { parsed, errors } = validateRow(values, '200');
      expect(errors).toHaveLength(0);
      expect(parsed.registrantName).toBe('Rahul Kumar');
      expect(parsed.registrationType).toBe(200);
      expect(parsed.registrationDate).toBe('2026-08-18');
      expect(parsed.paymentMethod).toBe('UPI');
    });

    it('should flag missing registrant name as an error', () => {
      const values = ['1', '2026-08-18', '', 'REG2026001'];
      const { errors } = validateRow(values, '250');
      expect(errors.some(e => e.field === 'registrant_name')).toBe(true);
    });

    it('should flag malformed dates as an error', () => {
      const values = ['1', 'invalid-date', 'John Doe', 'REG2026001'];
      const { errors } = validateRow(values, '200');
      expect(errors.some(e => e.field === 'registration_date')).toBe(true);
    });
  });

  describe('hashRow', () => {
    it('should generate consistent SHA-256 hashes for deduplication', () => {
      const values = ['1', '2026-08-18', 'Rahul Kumar', 'REG2026001'];
      const hash1 = hashRow('200', values);
      const hash2 = hashRow('200', values);
      const hashDiffTab = hashRow('250', values);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).not.toBe(hashDiffTab);
    });
  });
});
