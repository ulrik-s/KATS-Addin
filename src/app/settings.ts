import { readStorage, writeStorage } from './storage.js';

/**
 * User-controlled processor settings. Stored in localStorage so they
 * survive Word restarts; per-add-in scope means firm members can
 * each have their own without conflicting.
 *
 * The ARVODE rounding mode used to live here as a user-facing
 * preference. It is now derived from the recipient (court vs
 * non-court) in `processors/arvode/state.ts:getRoundingModeFromContext`.
 * See that function for the rule.
 */

// ──────────────────────── Category rates ──────────────────────

/**
 * Per-category billable rates in kr/h. The four categories match the
 * ARVODE table rows: timtaxa (arvode), timtaxa helg (arvode helg),
 * tidsspillan, and tidsspillan helg (tidsspillan övrig tid).
 *
 * Each has a hardcoded firm default; user-entered values override
 * per category. Empty / unset / unparseable input falls back to the
 * default at compute time, so the UI shows the default as a
 * placeholder and the field can be safely cleared without breaking
 * the run.
 */
export interface CategoryRates {
  readonly arvode: number;
  readonly arvodeHelg: number;
  readonly tidsspillan: number;
  readonly tidsspillanOvrigTid: number;
}

export const DEFAULT_RATES: CategoryRates = {
  arvode: 1626,
  arvodeHelg: 3256,
  tidsspillan: 1487,
  tidsspillanOvrigTid: 975,
};

const RATE_KEYS: Record<keyof CategoryRates, string> = {
  arvode: 'kats:rate:arvode',
  arvodeHelg: 'kats:rate:arvodeHelg',
  tidsspillan: 'kats:rate:tidsspillan',
  tidsspillanOvrigTid: 'kats:rate:tidsspillanOvrigTid',
};

/** Resolved rates with firm defaults filled in for empty/invalid storage. */
export function getCategoryRates(): CategoryRates {
  return {
    arvode: resolveRate('arvode'),
    arvodeHelg: resolveRate('arvodeHelg'),
    tidsspillan: resolveRate('tidsspillan'),
    tidsspillanOvrigTid: resolveRate('tidsspillanOvrigTid'),
  };
}

/** Persist user input verbatim (incl. empty string = "use default"). */
export function setCategoryRate(category: keyof CategoryRates, raw: string): void {
  writeStorage(RATE_KEYS[category], raw);
}

/** Stored raw value (or empty string when never set / cleared). */
export function getCategoryRateRaw(category: keyof CategoryRates): string {
  return readStorage(RATE_KEYS[category]) ?? '';
}

function resolveRate(category: keyof CategoryRates): number {
  const raw = readStorage(RATE_KEYS[category]);
  if (raw === undefined) return DEFAULT_RATES[category];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return DEFAULT_RATES[category];
  // Accept "1500" / "1 500" / "1500,50" / "1500.50".
  const cleaned = trimmed.replace(/\s+/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RATES[category];
}
