import { describe, it, expect } from 'vitest';
import {
  PERSONNUMMER_PATTERN,
  PERSONNUMMER_PATTERN_GLOBAL,
  extractPersonnummer,
  hasValidChecksum,
  isPersonnummerExact,
} from '../../src/domain/personnummer.js';

describe('isPersonnummerExact', () => {
  it('accepts standard form', () => {
    expect(isPersonnummerExact('800101-1234')).toBe(true);
    expect(isPersonnummerExact('000000-0000')).toBe(true);
  });

  it('tolerates leading/trailing whitespace', () => {
    expect(isPersonnummerExact('  800101-1234  ')).toBe(true);
  });

  it('rejects too few digits', () => {
    expect(isPersonnummerExact('80101-1234')).toBe(false);
    expect(isPersonnummerExact('800101-123')).toBe(false);
  });

  it('rejects missing dash', () => {
    expect(isPersonnummerExact('8001011234')).toBe(false);
  });

  it('rejects plus-separated form (archival)', () => {
    // Swedish personnummer for people over 100 uses `+` instead of `-`;
    // VBA only accepts `-`, so we match that for parity.
    expect(isPersonnummerExact('200101+1234')).toBe(false);
  });

  it('rejects surrounding text', () => {
    expect(isPersonnummerExact('Ulrik 800101-1234')).toBe(false);
  });
});

describe('extractPersonnummer', () => {
  it('pulls personnummer from a name line', () => {
    expect(extractPersonnummer('Ulrik Sjölin, 800101-1234')).toBe('800101-1234');
  });

  it('handles no-space dash in name line', () => {
    expect(extractPersonnummer('Åsa Östlund,800101-1234')).toBe('800101-1234');
  });

  it('returns undefined when no match', () => {
    expect(extractPersonnummer('Ulrik Sjölin')).toBeUndefined();
    expect(extractPersonnummer('just some text')).toBeUndefined();
  });

  it('returns only the first match', () => {
    expect(extractPersonnummer('800101-1234 and 700202-5678')).toBe('800101-1234');
  });

  it('ignores near-matches (wrong digit count)', () => {
    expect(extractPersonnummer('12345-6789')).toBeUndefined();
    expect(extractPersonnummer('1234567-8901')).toBeUndefined();
  });
});

describe('hasValidChecksum', () => {
  // 121212-1212 is the classic Swedish Skatteverket test personnummer
  // (all pairs of 12 — sum 20, Luhn-valid).
  it('accepts a known-valid personnummer', () => {
    expect(hasValidChecksum('121212-1212')).toBe(true);
  });

  it('rejects a one-digit-off personnummer', () => {
    expect(hasValidChecksum('121212-1213')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(hasValidChecksum('')).toBe(false);
    expect(hasValidChecksum('abc')).toBe(false);
    expect(hasValidChecksum('12345')).toBe(false);
  });
});

describe('PERSONNUMMER_PATTERN constants', () => {
  it('global pattern finds multiple matches', () => {
    const matches = [...'800101-1234, 700202-5678'.matchAll(PERSONNUMMER_PATTERN_GLOBAL)];
    expect(matches).toHaveLength(2);
  });

  it('non-global pattern returns one match via exec', () => {
    const m = PERSONNUMMER_PATTERN.exec('800101-1234');
    expect(m).not.toBeNull();
    expect(m?.[0]).toBe('800101-1234');
  });
});
