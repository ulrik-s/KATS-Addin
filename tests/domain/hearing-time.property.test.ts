/**
 * Property-based tests for `elapsedMinutesClamped`.
 *
 * Hand-written tests covered the design envelope (recent past hearing,
 * drafting 1h before) but not the quadrant "start way in the future"
 * — exactly where the 0,00 bug lived (PR #7). These properties
 * exercise the full (start, now) plane, so future refactors of the
 * clamp/wrap logic can't reintroduce that class of bug without one
 * of these failing.
 */
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { elapsedMinutesClamped } from '../../src/domain/hearing-time.js';

/** Realistic Date range — within ±10 years of today, no Invalid Date. */
const realisticDate = fc.date({
  min: new Date(2020, 0, 1),
  max: new Date(2035, 0, 1),
  noInvalidDate: true,
});

describe('elapsedMinutesClamped — properties', () => {
  it('result is always in [0, 1440]', () => {
    fc.assert(
      fc.property(realisticDate, realisticDate, (start, now) => {
        const result = elapsedMinutesClamped(start, now);
        return result >= 0 && result <= 24 * 60;
      }),
    );
  });

  it('result is an integer', () => {
    fc.assert(
      fc.property(realisticDate, realisticDate, (start, now) => {
        const result = elapsedMinutesClamped(start, now);
        return Number.isInteger(result);
      }),
    );
  });

  it('returns 0 whenever start ≥ now (hearing has not happened yet)', () => {
    // No matter how far `start` is in the future relative to `now`,
    // the result is 0 — that's the user-visible contract that the
    // pre-fix wrap-around violated by returning 0 for >24h-future
    // and `1440 - x` for 1..24h-future.
    fc.assert(
      fc.property(realisticDate, fc.integer({ min: 0, max: 1_000_000_000 }), (now, ms) => {
        const start = new Date(now.getTime() + ms);
        return elapsedMinutesClamped(start, now) === 0;
      }),
    );
  });

  it('matches floor((now - start) / 60000) when diff is in (0, 1440]', () => {
    fc.assert(
      fc.property(
        realisticDate,
        fc.integer({ min: 60_000, max: 1440 * 60_000 }), // 1 min .. 24h in ms
        (start, diffMs) => {
          const now = new Date(start.getTime() + diffMs);
          const expected = Math.floor(diffMs / 60_000);
          return elapsedMinutesClamped(start, now) === expected;
        },
      ),
    );
  });

  it('saturates at 1440 for any diff > 24h', () => {
    fc.assert(
      fc.property(
        realisticDate,
        fc.integer({ min: 24 * 60 * 60_000 + 1, max: 365 * 24 * 60 * 60_000 }),
        (start, diffMs) => {
          const now = new Date(start.getTime() + diffMs);
          return elapsedMinutesClamped(start, now) === 24 * 60;
        },
      ),
    );
  });

  it('is monotonic in `now` (later `now` ⇒ ≥ result)', () => {
    fc.assert(
      fc.property(
        realisticDate,
        fc.integer({ min: 0, max: 30 * 24 * 60 * 60_000 }),
        fc.integer({ min: 0, max: 30 * 24 * 60 * 60_000 }),
        (start, dA, dB) => {
          const small = Math.min(dA, dB);
          const big = Math.max(dA, dB);
          const a = elapsedMinutesClamped(start, new Date(start.getTime() + small));
          const b = elapsedMinutesClamped(start, new Date(start.getTime() + big));
          return b >= a;
        },
      ),
    );
  });

  it('regression: known seed values', () => {
    // Pin a few exact values so the property descriptions above are
    // grounded — easier to debug if one of the universally-quantified
    // properties fails.
    const start = new Date(2026, 4, 19, 9, 0);
    expect(elapsedMinutesClamped(start, new Date(2026, 4, 19, 9, 0))).toBe(0);
    expect(elapsedMinutesClamped(start, new Date(2026, 4, 19, 11, 30))).toBe(150);
    expect(elapsedMinutesClamped(start, new Date(2026, 4, 19, 9, 0, 59))).toBe(0);
    expect(elapsedMinutesClamped(start, new Date(2026, 4, 20, 9, 0))).toBe(1440);
    expect(elapsedMinutesClamped(start, new Date(2026, 4, 21, 9, 0))).toBe(1440);
    // The user-bug scenario:
    expect(elapsedMinutesClamped(new Date(2026, 5, 15, 9, 0), new Date(2026, 4, 19, 11, 30))).toBe(
      0,
    );
  });
});
