/**
 * Property-based tests for the money/number parser + formatters.
 *
 * Specifically targets the "mixed separator" edge case that caused
 * Cecilia's "1,597.00 kr" to parse as 1.597 (PR #1) and the
 * thousand-grouping/decimal-comma round-trips we depend on for
 * monolingual Swedish output (PR #4).
 */
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  formatSvDecimal,
  formatSvInt,
  formatSvNumber,
  roundHalfAwayFromZero,
  roundToDecimals,
  svToNumber,
} from '../../src/domain/money.js';

describe('svToNumber — properties', () => {
  it('round-trips formatSvNumber output back to the original value', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (n) => {
        // Round to 2 decimals first so the round-trip is well-defined.
        const rounded = roundToDecimals(n, 2);
        const formatted = formatSvNumber(rounded, 2);
        const parsed = svToNumber(formatted);
        // Allow tiny float drift on very large values.
        return Math.abs(parsed - rounded) < 0.01;
      }),
    );
  });

  it('is invariant under leading/trailing whitespace', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.nat({ max: 5 }), (n, pad) => {
        const rounded = roundToDecimals(n, 2);
        const s = formatSvNumber(rounded, 2);
        const padded = ' '.repeat(pad) + s + ' '.repeat(pad);
        return svToNumber(padded) === svToNumber(s);
      }),
    );
  });

  it('English thousand-comma + dot-decimal parses as one number', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 99 }),
        (whole, cents) => {
          // Build "X,XXX,XXX.YY" English-formatted.
          const groups: string[] = [];
          let s = String(whole);
          while (s.length > 3) {
            groups.unshift(s.slice(-3));
            s = s.slice(0, -3);
          }
          groups.unshift(s);
          const english = `${groups.join(',')}.${String(cents).padStart(2, '0')}`;
          const expected = whole + cents / 100;
          // svToNumber should return `expected` (last separator = decimal).
          return Math.abs(svToNumber(english) - expected) < 0.01;
        },
      ),
    );
  });

  it('Swedish space-thousand + comma-decimal parses as one number', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 99 }),
        (whole, cents) => {
          // Build "X XXX XXX,YY" Swedish-formatted.
          const groups: string[] = [];
          let s = String(whole);
          while (s.length > 3) {
            groups.unshift(s.slice(-3));
            s = s.slice(0, -3);
          }
          groups.unshift(s);
          const swedish = `${groups.join(' ')},${String(cents).padStart(2, '0')}`;
          const expected = whole + cents / 100;
          return Math.abs(svToNumber(swedish) - expected) < 0.01;
        },
      ),
    );
  });

  it('empty / non-numeric input returns 0', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(' ', 'a', 'b', '!', '_', '\t') }),
        (junk) => svToNumber(junk) === 0,
      ),
    );
  });
});

describe('formatSvInt — properties', () => {
  it('only contains digits and spaces (and optional leading minus)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e12, max: 1e12 }), (n) => {
        const s = formatSvInt(n);
        return /^-?[0-9 ]+$/.test(s);
      }),
    );
  });

  it('round-trips through svToNumber for integer inputs', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e9, max: 1e9 }), (n) => {
        return svToNumber(formatSvInt(n)) === n;
      }),
    );
  });
});

describe('formatSvDecimal / formatSvNumber — properties', () => {
  it('formatSvDecimal output always ends with `,DD` when decimals > 0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.integer({ min: 1, max: 4 }),
        (n, dec) => {
          const s = formatSvDecimal(n, dec);
          const re = new RegExp(`,[0-9]{${String(dec)}}$`);
          return re.test(s);
        },
      ),
    );
  });

  it('formatSvNumber uses space-thousand for values ≥ 1000', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 1e9 }), (n) => {
        const s = formatSvNumber(n, 0);
        return s.includes(' ');
      }),
    );
  });

  it('formatSvNumber(0, decimals) is never negative-signed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (dec) => {
        return !formatSvNumber(0, dec).startsWith('-');
      }),
    );
  });
});

describe('roundHalfAwayFromZero — properties', () => {
  it('result is always an integer', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (n) => {
        return Number.isInteger(roundHalfAwayFromZero(n));
      }),
    );
  });

  it('|round(x) - x| ≤ 0.5', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (n) => {
        return Math.abs(roundHalfAwayFromZero(n) - n) <= 0.5 + 1e-9;
      }),
    );
  });

  it('round(-x) === -round(x) (symmetry — the half-away-from-zero contract)', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (n) => {
        return roundHalfAwayFromZero(-n) === -roundHalfAwayFromZero(n);
      }),
    );
  });

  it('regression: known half-boundary cases', () => {
    expect(roundHalfAwayFromZero(0.5)).toBe(1);
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1);
    expect(roundHalfAwayFromZero(1.5)).toBe(2);
    expect(roundHalfAwayFromZero(-1.5)).toBe(-2);
  });
});
