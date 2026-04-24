import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { tagName, PHASES } from '../../src/core/processor.js';

describe('tagName', () => {
  it('accepts valid tag names', () => {
    expect(tagName('KATS_UTLAGG') as string).toBe('KATS_UTLAGG');
    expect(tagName('KATS_ARVODE_TOTAL') as string).toBe('KATS_ARVODE_TOTAL');
    expect(tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA') as string).toBe(
      'KATS_ARGRUPPERTIDERDATUMANTALSUMMA',
    );
  });

  it('rejects missing KATS_ prefix', () => {
    expect(() => tagName('UTLAGG')).toThrow(ZodError);
  });

  it('rejects lowercase names', () => {
    expect(() => tagName('KATS_utlagg')).toThrow(ZodError);
  });

  it('rejects names with digits or specials', () => {
    expect(() => tagName('KATS_UT1AGG')).toThrow(ZodError);
    expect(() => tagName('KATS_UT-LAGG')).toThrow(ZodError);
    expect(() => tagName('')).toThrow(ZodError);
  });

  it('rejects names with only the prefix', () => {
    expect(() => tagName('KATS_')).toThrow(ZodError);
  });
});

describe('PHASES', () => {
  it('lists the three phases in execution order', () => {
    expect(PHASES).toEqual(['read', 'transform', 'render']);
  });
});
