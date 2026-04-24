import { describe, it, expect } from 'vitest';
import { SWEDISH_MONTHS, swedishMonthName, formatSwedishDate } from '../../src/domain/dates.js';

describe('SWEDISH_MONTHS', () => {
  it('lists 12 lowercase Swedish month names in order', () => {
    expect(SWEDISH_MONTHS).toEqual([
      'januari',
      'februari',
      'mars',
      'april',
      'maj',
      'juni',
      'juli',
      'augusti',
      'september',
      'oktober',
      'november',
      'december',
    ]);
  });
});

describe('swedishMonthName', () => {
  it('returns each month by 1-based index', () => {
    expect(swedishMonthName(1)).toBe('januari');
    expect(swedishMonthName(4)).toBe('april');
    expect(swedishMonthName(12)).toBe('december');
  });

  it('throws RangeError on 0', () => {
    expect(() => swedishMonthName(0)).toThrow(RangeError);
  });

  it('throws RangeError on 13', () => {
    expect(() => swedishMonthName(13)).toThrow(RangeError);
  });

  it('throws RangeError on negative', () => {
    expect(() => swedishMonthName(-1)).toThrow(RangeError);
  });
});

describe('formatSwedishDate', () => {
  it('formats a typical date as "D MMMM YYYY"', () => {
    // Using local-time constructor; all tests run in the same TZ.
    const d = new Date(2026, 3, 24); // April is month 3 (0-based) in JS
    expect(formatSwedishDate(d)).toBe('24 april 2026');
  });

  it('uses no leading zero on the day', () => {
    const d = new Date(2026, 0, 1);
    expect(formatSwedishDate(d)).toBe('1 januari 2026');
  });

  it('handles December 31', () => {
    const d = new Date(2026, 11, 31);
    expect(formatSwedishDate(d)).toBe('31 december 2026');
  });

  it('handles a leap-year Feb 29', () => {
    const d = new Date(2028, 1, 29);
    expect(formatSwedishDate(d)).toBe('29 februari 2028');
  });

  it('uses a 4-digit year', () => {
    const d = new Date(999, 5, 15);
    // JS Date constructor adds 1900 for years 0..99, so 999 stays 999.
    expect(formatSwedishDate(d)).toBe('15 juni 999');
  });
});
