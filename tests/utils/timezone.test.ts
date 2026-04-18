import { describe, it, expect } from 'vitest';
import { convertToUtc, isValidTimezone, parseDate } from '../../src/utils/timezone';

describe('timezone utils', () => {
  describe('isValidTimezone', () => {
    it('returns true for valid IANA timezone', () => {
      expect(isValidTimezone('Africa/Johannesburg')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
    });

    it('returns false for invalid timezone', () => {
      expect(isValidTimezone('Invalid/Zone')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone('NotATimezone')).toBe(false);
    });
  });

  describe('parseDate', () => {
    it('parses valid YYYYMMDD HH:MM format', () => {
      const result = parseDate('20250315 14:30');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2025);
      expect(result!.getMonth()).toBe(2); // March = 2
      expect(result!.getDate()).toBe(15);
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(30);
    });

    it('returns null for invalid format', () => {
      expect(parseDate('2025-03-15 14:30')).toBeNull();
      expect(parseDate('not a date')).toBeNull();
      expect(parseDate('')).toBeNull();
      expect(parseDate('20250315')).toBeNull();
    });

    it('returns null for impossible dates', () => {
      expect(parseDate('20250230 14:30')).toBeNull(); // Feb 30
      expect(parseDate('20251301 14:30')).toBeNull(); // Month 13
    });

    it('handles midnight correctly', () => {
      const result = parseDate('20250101 00:00');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });
  });

  describe('convertToUtc', () => {
    it('converts a local date to UTC', () => {
      const localDate = new Date(2025, 2, 15, 14, 0); // March 15, 2025 14:00
      const result = convertToUtc(localDate, 'Africa/Johannesburg'); // UTC+2
      // 14:00 SAST = 12:00 UTC
      expect(result.getUTCHours()).toBe(12);
    });

    it('handles UTC timezone as no-op', () => {
      const date = new Date(2025, 5, 1, 10, 0);
      const result = convertToUtc(date, 'UTC');
      expect(result.getUTCHours()).toBe(10);
    });
  });
});
