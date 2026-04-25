import { describe, it, expect } from 'vitest';
import { TAXA_MAX_MINUTES, formatHoursAndMinutes, getTaxaAmount } from '../../src/domain/taxa.js';

describe('getTaxaAmount — 15-tier lookup', () => {
  it('returns first tier for 0 minutes', () => {
    expect(getTaxaAmount(0)).toBe(2809);
  });

  it('returns first tier at the upper boundary (14 min)', () => {
    expect(getTaxaAmount(14)).toBe(2809);
  });

  it('returns second tier at 15 min (boundary crossing)', () => {
    expect(getTaxaAmount(15)).toBe(2980);
  });

  it('lookup matches all 15 published tiers', () => {
    const expected: readonly (readonly [number, number])[] = [
      [0, 2809],
      [14, 2809],
      [15, 2980],
      [29, 2980],
      [30, 3509],
      [44, 3509],
      [45, 4049],
      [59, 4049],
      [60, 4583],
      [74, 4583],
      [75, 5106],
      [89, 5106],
      [90, 5635],
      [104, 5635],
      [105, 6164],
      [119, 6164],
      [120, 6704],
      [134, 6704],
      [135, 7227],
      [149, 7227],
      [150, 7767],
      [164, 7767],
      [165, 8301],
      [179, 8301],
      [180, 8824],
      [194, 8824],
      [195, 9364],
      [209, 9364],
      [210, 9887],
      [225, 9887],
    ];
    for (const [minutes, amount] of expected) {
      expect(getTaxaAmount(minutes), `at ${String(minutes)} min`).toBe(amount);
    }
  });

  it('returns 0 for hearings longer than 225 minutes', () => {
    expect(getTaxaAmount(226)).toBe(0);
    expect(getTaxaAmount(500)).toBe(0);
    expect(getTaxaAmount(TAXA_MAX_MINUTES + 1)).toBe(0);
  });

  it('clamps negative input to 0', () => {
    expect(getTaxaAmount(-10)).toBe(2809);
  });

  it('rejects NaN / Infinity', () => {
    expect(getTaxaAmount(Number.NaN)).toBe(0);
    expect(getTaxaAmount(Number.POSITIVE_INFINITY)).toBe(0);
    expect(getTaxaAmount(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('floors fractional minutes', () => {
    expect(getTaxaAmount(14.9)).toBe(2809);
    expect(getTaxaAmount(15.1)).toBe(2980);
  });
});

describe('formatHoursAndMinutes', () => {
  it('formats whole hours', () => {
    expect(formatHoursAndMinutes(0)).toBe('0 tim 0 min');
    expect(formatHoursAndMinutes(60)).toBe('1 tim 0 min');
    expect(formatHoursAndMinutes(120)).toBe('2 tim 0 min');
  });

  it('formats minutes < 60', () => {
    expect(formatHoursAndMinutes(15)).toBe('0 tim 15 min');
    expect(formatHoursAndMinutes(45)).toBe('0 tim 45 min');
  });

  it('formats mixed', () => {
    expect(formatHoursAndMinutes(75)).toBe('1 tim 15 min');
    expect(formatHoursAndMinutes(225)).toBe('3 tim 45 min');
  });

  it('floors fractional minutes', () => {
    expect(formatHoursAndMinutes(75.9)).toBe('1 tim 15 min');
  });

  it('clamps negatives to 0', () => {
    expect(formatHoursAndMinutes(-10)).toBe('0 tim 0 min');
  });
});
