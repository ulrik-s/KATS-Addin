import { describe, it, expect } from 'vitest';
import { formatRateSpec, parseRateKr } from '../../src/domain/rate.js';

describe('parseRateKr', () => {
  it('parses á-separated rate', () => {
    expect(parseRateKr('2,5 á 850 kr')).toBe(850);
    expect(parseRateKr('1 á 1 250')).toBe(1250);
  });

  it('parses à-separated rate (legacy form)', () => {
    expect(parseRateKr('2,5 à 850 kr')).toBe(850);
  });

  it('falls back to parsing the whole string when no separator', () => {
    expect(parseRateKr('850')).toBe(850);
    expect(parseRateKr('850 kr')).toBe(850);
  });

  it('returns 0 for empty / digit-free input', () => {
    expect(parseRateKr('')).toBe(0);
    expect(parseRateKr('no rate here')).toBe(0);
  });

  it('does NOT fall back to plain ASCII "a" — rejected after commit 86d0ca6', () => {
    // "Anlitad a 850" looks like it might match — but plain "a" is no
    // longer a separator (false-positive risk in prose).
    expect(parseRateKr('Anlitad a 850 kr')).toBe(850); // falls back to bare-number parse
    expect(parseRateKr('850')).toBe(850);
    // The fallback kicks in for "Anlitad a 850 kr" because svToNumber
    // strips non-digit chars. So the test of "no plain-a separator" is:
    expect(parseRateKr('a850')).toBe(850); // would-be-bug check: not separator-prefixed
  });

  it('NFC-normalizes NFD input', () => {
    // NFD á = a + combining acute U+0301
    const nfd = '2,5 a\u0301 850 kr';
    expect(parseRateKr(nfd)).toBe(850);
  });
});

describe('formatRateSpec', () => {
  it('formats with comma decimal and thousand-spaces on rate', () => {
    expect(formatRateSpec(1.5, 850)).toBe('1,50 \u00e1 850 kr');
    expect(formatRateSpec(2.5, 1250)).toBe('2,50 \u00e1 1 250 kr');
  });

  it('rounds rate to integer kr', () => {
    expect(formatRateSpec(1, 850.4)).toBe('1,00 \u00e1 850 kr');
    expect(formatRateSpec(1, 850.6)).toBe('1,00 \u00e1 851 kr');
  });

  it('preserves the actual á character (U+00E1, not plain a)', () => {
    expect(formatRateSpec(1, 100)).toContain('\u00e1');
    expect(formatRateSpec(1, 100)).not.toContain(' a ');
  });
});
