/**
 * Swedish date formatting. Mirrors VBA `SwedishDateText` exactly:
 *
 *   "Lund den 24 april 2026"
 *     - city preserved
 *     - "den" lowercase
 *     - day without leading zero
 *     - month lowercase
 *     - 4-digit year
 */

const SWEDISH_MONTHS_12 = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
] as const;

export type SwedishMonth = (typeof SWEDISH_MONTHS_12)[number];
export const SWEDISH_MONTHS: readonly SwedishMonth[] = SWEDISH_MONTHS_12;

/** 1-based month index to Swedish month name. Throws on 0 or >12. */
export function swedishMonthName(monthIndex1Based: number): SwedishMonth {
  const m = SWEDISH_MONTHS_12[monthIndex1Based - 1];
  if (m === undefined) {
    throw new RangeError(`Invalid month index (must be 1..12): ${String(monthIndex1Based)}`);
  }
  return m;
}

/**
 * Format a `Date` as "DAY MONTH YEAR" in Swedish (local time).
 * Does not include the city prefix or "den" — signature-building is
 * the caller's job; see `domain/signature.ts`.
 */
export function formatSwedishDate(date: Date): string {
  const day = date.getDate();
  const month = swedishMonthName(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${String(day)} ${month} ${String(year)}`;
}
