/**
 * Court fee schedule (taxa) lookup for the Swedish 2026 fee tiers.
 *
 * Hearings at or below 225 minutes get a flat-rate fee determined by
 * 15-minute buckets. Anything longer falls outside the schedule and
 * the regular hourly model applies.
 *
 * Ported verbatim from VBA `GetTaxAmountLevel1`. Update when the
 * Swedish courts publish a new fee schedule.
 */

interface TaxaTier {
  /** Inclusive upper bound in minutes (lower bound is previous tier + 1). */
  readonly maxMinutes: number;
  readonly amountKr: number;
}

const TAXA_TIERS: readonly TaxaTier[] = [
  { maxMinutes: 14, amountKr: 2809 },
  { maxMinutes: 29, amountKr: 2980 },
  { maxMinutes: 44, amountKr: 3509 },
  { maxMinutes: 59, amountKr: 4049 },
  { maxMinutes: 74, amountKr: 4583 },
  { maxMinutes: 89, amountKr: 5106 },
  { maxMinutes: 104, amountKr: 5635 },
  { maxMinutes: 119, amountKr: 6164 },
  { maxMinutes: 134, amountKr: 6704 },
  { maxMinutes: 149, amountKr: 7227 },
  { maxMinutes: 164, amountKr: 7767 },
  { maxMinutes: 179, amountKr: 8301 },
  { maxMinutes: 194, amountKr: 8824 },
  { maxMinutes: 209, amountKr: 9364 },
  { maxMinutes: 225, amountKr: 9887 },
];

/** Maximum hearing duration in minutes that taxa applies to. */
export const TAXA_MAX_MINUTES = 225;

/**
 * Look up the taxa amount for a hearing of `minutes` length.
 *
 * `minutes < 0` clamps to 0. `minutes > 225` returns 0 (no taxa).
 * Buckets are inclusive on the upper bound: 14 maps to the first tier,
 * 15 to the second, 225 to the last.
 */
export function getTaxaAmount(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  if (minutes > TAXA_MAX_MINUTES) return 0;
  const m = minutes < 0 ? 0 : Math.floor(minutes);
  for (const tier of TAXA_TIERS) {
    if (m <= tier.maxMinutes) return tier.amountKr;
  }
  return 0;
}

/**
 * Format a hearing duration as `H tim M min` in Swedish.
 * `0` → `"0 tim 0 min"`, `90` → `"1 tim 30 min"`.
 */
export function formatHoursAndMinutes(totalMinutes: number): string {
  const m = totalMinutes < 0 ? 0 : Math.floor(totalMinutes);
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  return `${String(hours)} tim ${String(minutes)} min`;
}
