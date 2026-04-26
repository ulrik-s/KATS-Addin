import { describe, it, expect } from 'vitest';
import {
  PERSONNUMMER_PATTERN,
  PERSONNUMMER_PATTERN_GLOBAL,
  extractPersonnummer,
  hasValidChecksum,
  isPersonnummerExact,
} from '../../src/domain/personnummer.js';

describe('isPersonnummerExact', () => {
  it('accepts short form (YYMMDD-NNNN)', () => {
    expect(isPersonnummerExact('800101-1234')).toBe(true);
    expect(isPersonnummerExact('000000-0000')).toBe(true);
  });

  it('accepts long form (YYYYMMDD-NNNN)', () => {
    expect(isPersonnummerExact('19800101-1234')).toBe(true);
    expect(isPersonnummerExact('20051231-9999')).toBe(true);
  });

  it('tolerates leading/trailing whitespace on both forms', () => {
    expect(isPersonnummerExact('  800101-1234  ')).toBe(true);
    expect(isPersonnummerExact('  19800101-1234  ')).toBe(true);
  });

  it('rejects 5- or 7-digit prefixes', () => {
    expect(isPersonnummerExact('80101-1234')).toBe(false);
    expect(isPersonnummerExact('1980101-1234')).toBe(false);
  });

  it('rejects too few/many trailing digits', () => {
    expect(isPersonnummerExact('800101-123')).toBe(false);
    expect(isPersonnummerExact('800101-12345')).toBe(false);
  });

  it('rejects missing dash', () => {
    expect(isPersonnummerExact('8001011234')).toBe(false);
    expect(isPersonnummerExact('198001011234')).toBe(false);
  });

  it('rejects plus-separated form (archival)', () => {
    expect(isPersonnummerExact('200101+1234')).toBe(false);
  });

  it('rejects surrounding text', () => {
    expect(isPersonnummerExact('Ulrik 800101-1234')).toBe(false);
    expect(isPersonnummerExact('Ulrik 19800101-1234')).toBe(false);
  });
});

describe('extractPersonnummer', () => {
  it('pulls short-form personnummer from a name line', () => {
    expect(extractPersonnummer('Ulrik Sjölin, 800101-1234')).toBe('800101-1234');
  });

  it('pulls long-form personnummer from a name line', () => {
    expect(extractPersonnummer('Ulrik Sjölin, 19800101-1234')).toBe('19800101-1234');
  });

  it('prefers the longer match when both could fit', () => {
    // The 8-digit alternative comes first in the regex alternation,
    // so we don't accidentally match `800101-1234` out of `19800101-1234`.
    expect(extractPersonnummer('Sjölin, 19800101-1234')).toBe('19800101-1234');
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
  it('accepts a known-valid short-form personnummer', () => {
    expect(hasValidChecksum('121212-1212')).toBe(true);
  });

  it('accepts the same personnummer in long form (century prefix ignored)', () => {
    expect(hasValidChecksum('19121212-1212')).toBe(true);
    expect(hasValidChecksum('20121212-1212')).toBe(true);
  });

  it('rejects a one-digit-off personnummer (both forms)', () => {
    expect(hasValidChecksum('121212-1213')).toBe(false);
    expect(hasValidChecksum('19121212-1213')).toBe(false);
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
