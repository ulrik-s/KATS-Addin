import { readStorage, writeStorage } from './storage.js';

/**
 * User-controlled processor settings. Stored in localStorage so they
 * survive Word restarts; per-add-in scope means firm members can
 * each have their own without conflicting.
 */

const ROUNDING_KEY = 'kats:roundingMode';
const HOURLY_RATE_KEY = 'kats:hourlyRateKr';

/**
 * Two policies for ARVODE per-row rounding:
 *
 *   "per-row"  — court documents (tingsrätt / hovrätt). Each row's
 *                amount is rounded to whole kr before summing. Total
 *                = sum of rounded rows. Matches the legacy VBA
 *                behavior; default for the firm.
 *   "sum-only" — non-court documents. Per-row amounts kept exact
 *                (potentially fractional kr). Total computed exact
 *                then rounded to whole kr at the end.
 */
export type RoundingMode = 'per-row' | 'sum-only';

export const DEFAULT_ROUNDING_MODE: RoundingMode = 'per-row';

export function getRoundingMode(): RoundingMode {
  const v = readStorage(ROUNDING_KEY);
  return v === 'sum-only' ? 'sum-only' : DEFAULT_ROUNDING_MODE;
}

export function setRoundingMode(mode: RoundingMode): void {
  writeStorage(ROUNDING_KEY, mode);
}

/**
 * Optional hourly-rate override. When set, `parseRateKr()` of the
 * ARVODE row's spec cell is ignored and this value is used for
 * every category (arvode, arvode helg, tidsspillan, tidsspillan
 * övrig tid). When unset, each row's spec cell determines the rate.
 *
 * Stored as the user-entered string so we can preserve "" (empty =
 * unset) without ambiguity. Parsed lazily.
 */
export function getHourlyRateOverride(): number | undefined {
  const raw = readStorage(HOURLY_RATE_KEY);
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  // Accept both "1500" and "1 500" and "1500,50" and "1500.50".
  const cleaned = trimmed.replace(/\s+/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Set the override. Empty / whitespace string clears it. */
export function setHourlyRateOverride(raw: string): void {
  writeStorage(HOURLY_RATE_KEY, raw);
}

/** Read the raw string (for the input field's controlled value). */
export function getHourlyRateOverrideRaw(): string {
  return readStorage(HOURLY_RATE_KEY) ?? '';
}
