import { describe, it, expect } from 'vitest';
import {
  formatSvDecimal,
  formatSvInt,
  formatSvMoney,
  hasAnyDigit,
  roundHalfAwayFromZero,
  roundToDecimals,
  svToNumber,
} from '../../src/domain/money.js';

describe('svToNumber — Swedish/English number parser', () => {
  it('parses integers', () => {
    expect(svToNumber('1234')).toBe(1234);
    expect(svToNumber('0')).toBe(0);
  });

  it('accepts comma as decimal separator', () => {
    expect(svToNumber('1234,56')).toBe(1234.56);
  });

  it('accepts period as decimal separator', () => {
    expect(svToNumber('1234.56')).toBe(1234.56);
  });

  it('strips thousands-spaces', () => {
    expect(svToNumber('1 234 567,89')).toBe(1234567.89);
  });

  it('strips currency suffix', () => {
    expect(svToNumber('1 234,56 kr')).toBe(1234.56);
  });

  it('handles negatives (only when leading)', () => {
    expect(svToNumber('-100')).toBe(-100);
    expect(svToNumber('-1 234,56')).toBe(-1234.56);
    // Embedded minus is dropped (legacy VBA behavior).
    expect(svToNumber('1-234')).toBe(1234);
  });

  it('drops second/third decimal separators', () => {
    expect(svToNumber('1.234.56')).toBe(1.23456);
    expect(svToNumber('1,234,56')).toBe(1.23456);
  });

  it('returns 0 for empty / unparseable', () => {
    expect(svToNumber('')).toBe(0);
    expect(svToNumber('   ')).toBe(0);
    expect(svToNumber('abc')).toBe(0);
    expect(svToNumber('-')).toBe(0);
    expect(svToNumber('.')).toBe(0);
  });

  it('parses á-prefixed rate trailing', () => {
    // Used by ParseRateKr — strip the prefix outside; this just confirms
    // the inner parser works on bare numerics.
    expect(svToNumber(' 850 kr')).toBe(850);
  });
});

describe('roundHalfAwayFromZero', () => {
  it('rounds positive halves up', () => {
    expect(roundHalfAwayFromZero(0.5)).toBe(1);
    expect(roundHalfAwayFromZero(1.5)).toBe(2);
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
  });

  it('rounds negative halves down (away from zero)', () => {
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1);
    expect(roundHalfAwayFromZero(-1.5)).toBe(-2);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
  });

  it('rounds non-halves the obvious way', () => {
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
    expect(roundHalfAwayFromZero(2.6)).toBe(3);
    expect(roundHalfAwayFromZero(-2.4)).toBe(-2);
    expect(roundHalfAwayFromZero(-2.6)).toBe(-3);
  });

  it('preserves integers', () => {
    expect(roundHalfAwayFromZero(0)).toBe(0);
    expect(roundHalfAwayFromZero(42)).toBe(42);
    expect(roundHalfAwayFromZero(-42)).toBe(-42);
  });

  it('differs from Math.round on negative halves', () => {
    expect(Math.round(-0.5)).toBe(-0); // would-be bug
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1); // our intent
  });
});

describe('roundToDecimals', () => {
  it('rounds to 0 decimals', () => {
    expect(roundToDecimals(1.5, 0)).toBe(2);
    expect(roundToDecimals(2.5, 0)).toBe(3);
  });

  it('rounds to 2 decimals (the common case)', () => {
    expect(roundToDecimals(1.555, 2)).toBe(1.56);
    expect(roundToDecimals(1.554, 2)).toBe(1.55);
    expect(roundToDecimals(-1.555, 2)).toBe(-1.56);
  });

  it('rounds to 1 decimal', () => {
    expect(roundToDecimals(1.25, 1)).toBe(1.3);
  });

  it('falls back to 2 decimals on out-of-range input', () => {
    expect(roundToDecimals(1.555, -1)).toBe(1.56);
    expect(roundToDecimals(1.555, 99)).toBe(1.56);
  });
});

describe('formatSvInt', () => {
  it('formats small numbers without separator', () => {
    expect(formatSvInt(0)).toBe('0');
    expect(formatSvInt(42)).toBe('42');
    expect(formatSvInt(999)).toBe('999');
  });

  it('inserts thousand-spaces', () => {
    expect(formatSvInt(1000)).toBe('1 000');
    expect(formatSvInt(4209)).toBe('4 209');
    expect(formatSvInt(12345)).toBe('12 345');
    expect(formatSvInt(1234567)).toBe('1 234 567');
  });

  it('handles negatives', () => {
    expect(formatSvInt(-1000)).toBe('-1 000');
    expect(formatSvInt(-42)).toBe('-42');
  });

  it('rounds non-integers', () => {
    expect(formatSvInt(1234.5)).toBe('1 235');
    expect(formatSvInt(1234.4)).toBe('1 234');
  });
});

describe('formatSvDecimal', () => {
  it('formats with the requested decimals + Swedish comma', () => {
    expect(formatSvDecimal(4.5, 2)).toBe('4,50');
    expect(formatSvDecimal(1.555, 2)).toBe('1,56');
    expect(formatSvDecimal(1234, 2)).toBe('1234,00');
  });

  it('does NOT use thousand-spaces (parity with VBA)', () => {
    expect(formatSvDecimal(12345.67, 2)).toBe('12345,67');
  });

  it('handles 0 decimals (integers with comma optional)', () => {
    expect(formatSvDecimal(4.5, 0)).toBe('5');
    expect(formatSvDecimal(1234, 0)).toBe('1234');
  });

  it('handles negatives', () => {
    expect(formatSvDecimal(-1.5, 2)).toBe('-1,50');
  });
});

describe('formatSvMoney', () => {
  it('formats whole kronor with two-zero öre', () => {
    expect(formatSvMoney(4209)).toBe('4 209,00 kr');
    expect(formatSvMoney(0)).toBe('0,00 kr');
  });

  it('formats fractional amounts', () => {
    expect(formatSvMoney(4209.57)).toBe('4 209,57 kr');
    expect(formatSvMoney(1234.5)).toBe('1 234,50 kr');
  });

  it('rounds half-away-from-zero at the öre boundary', () => {
    expect(formatSvMoney(1234.555)).toBe('1 234,56 kr');
    expect(formatSvMoney(-1234.555)).toBe('-1 234,56 kr');
  });

  it('handles negatives', () => {
    expect(formatSvMoney(-100)).toBe('-100,00 kr');
  });

  it('thousand-spaces only on the kronor part', () => {
    expect(formatSvMoney(1234567.89)).toBe('1 234 567,89 kr');
  });

  it('zero pads single-digit öre', () => {
    expect(formatSvMoney(100.05)).toBe('100,05 kr');
    expect(formatSvMoney(100.5)).toBe('100,50 kr');
  });
});

describe('hasAnyDigit', () => {
  it('returns true when at least one digit is present', () => {
    expect(hasAnyDigit('abc1xyz')).toBe(true);
    expect(hasAnyDigit('0')).toBe(true);
  });

  it('returns false for digit-free strings', () => {
    expect(hasAnyDigit('')).toBe(false);
    expect(hasAnyDigit('abc')).toBe(false);
    expect(hasAnyDigit(' kr ')).toBe(false);
  });
});
