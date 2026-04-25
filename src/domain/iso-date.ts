/**
 * ISO date detection and parsing for KATS table rows.
 *
 * The economics-chain processors use `LooksLikeIsoDate` (VBA) to
 * distinguish data rows from heading / summary / blank rows. Data rows
 * have an ISO-formatted date in column 1.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True if `s` is exactly `YYYY-MM-DD`, ignoring surrounding whitespace. */
export function looksLikeIsoDate(s: string): boolean {
  return ISO_DATE_PATTERN.test(s.trim());
}

/**
 * Parse an ISO date string. Returns a UTC `Date` at midnight, or
 * `undefined` if the string does not match `YYYY-MM-DD` or the
 * resulting date is invalid (e.g. month 13, day 31 in February).
 */
export function parseIsoDate(s: string): Date | undefined {
  const trimmed = s.trim();
  if (!ISO_DATE_PATTERN.test(trimmed)) return undefined;
  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Reject silently-rolled dates, e.g. 2026-02-31 → 2026-03-03.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return undefined;
  }
  return d;
}
