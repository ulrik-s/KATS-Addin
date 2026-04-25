import { describe, it, expect } from 'vitest';
import { looksLikeIsoDate, parseIsoDate } from '../../src/domain/iso-date.js';

describe('looksLikeIsoDate', () => {
  it('accepts well-formed ISO dates', () => {
    expect(looksLikeIsoDate('2026-04-25')).toBe(true);
    expect(looksLikeIsoDate('1999-12-31')).toBe(true);
  });

  it('tolerates surrounding whitespace', () => {
    expect(looksLikeIsoDate('  2026-04-25  ')).toBe(true);
  });

  it('rejects malformed forms', () => {
    expect(looksLikeIsoDate('2026-4-25')).toBe(false);
    expect(looksLikeIsoDate('2026/04/25')).toBe(false);
    expect(looksLikeIsoDate('25-04-2026')).toBe(false);
    expect(looksLikeIsoDate('20260425')).toBe(false);
    expect(looksLikeIsoDate('')).toBe(false);
  });

  it('rejects strings with extra text', () => {
    expect(looksLikeIsoDate('2026-04-25 12:00')).toBe(false);
    expect(looksLikeIsoDate('Date: 2026-04-25')).toBe(false);
  });
});

describe('parseIsoDate', () => {
  it('parses to a UTC date at midnight', () => {
    const d = parseIsoDate('2026-04-25');
    expect(d?.getUTCFullYear()).toBe(2026);
    expect(d?.getUTCMonth()).toBe(3);
    expect(d?.getUTCDate()).toBe(25);
  });

  it('returns undefined for non-ISO input', () => {
    expect(parseIsoDate('2026-4-25')).toBeUndefined();
    expect(parseIsoDate('not a date')).toBeUndefined();
  });

  it('rejects invalid calendar dates', () => {
    expect(parseIsoDate('2026-13-01')).toBeUndefined();
    expect(parseIsoDate('2026-02-31')).toBeUndefined();
    expect(parseIsoDate('2026-00-15')).toBeUndefined();
    expect(parseIsoDate('2026-04-00')).toBeUndefined();
  });

  it('accepts a leap-day date', () => {
    expect(parseIsoDate('2028-02-29')).toBeDefined();
    expect(parseIsoDate('2026-02-29')).toBeUndefined(); // not a leap year
  });
});
