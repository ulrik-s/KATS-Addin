/**
 * Swedish personal identity number (personnummer) utilities.
 *
 * Two accepted formats:
 *   `YYMMDD-NNNN`     (10 digits + dash) — short form
 *   `YYYYMMDD-NNNN`   (12 digits + dash) — full form with century
 *
 * The 8-digit alternative comes first in the alternation so the regex
 * engine prefers the longer match — otherwise `19821212-1212` would
 * match as `821212-1212` (with `19` left dangling outside).
 *
 * The VBA reference only checked the structural format, not the Luhn
 * checksum or date validity; we keep the same semantics by default
 * and expose `hasValidChecksum` for future stricter paths.
 */

/** Matches `\d{6}-\d{4}` or `\d{8}-\d{4}`. */
export const PERSONNUMMER_PATTERN = /\b(\d{8}|\d{6})-(\d{4})\b/;

/** Same, but allowed to appear anywhere in a string (used for name-line parsing). */
export const PERSONNUMMER_PATTERN_GLOBAL = /\b(\d{8}|\d{6})-(\d{4})\b/g;

/** True if `s` exactly equals one of the two canonical forms. */
export function isPersonnummerExact(s: string): boolean {
  return /^(?:\d{8}|\d{6})-\d{4}$/.test(s.trim());
}

/** Extract the first personnummer occurrence from a line, or undefined. */
export function extractPersonnummer(line: string): string | undefined {
  const match = PERSONNUMMER_PATTERN.exec(line);
  return match ? `${match[1] ?? ''}-${match[2] ?? ''}` : undefined;
}

/**
 * Luhn checksum validation. Operates on the last 10 digits whether
 * the input is 6+4 or 8+4 — the century prefix is informational and
 * not part of the official check.
 */
export function hasValidChecksum(pnr: string): boolean {
  const digits = pnr.replace(/-/g, '');
  if (!/^(?:\d{10}|\d{12})$/.test(digits)) return false;
  const last10 = digits.slice(-10);
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const d = Number(last10.charAt(i));
    const weighted = i % 2 === 0 ? d * 2 : d;
    sum += weighted > 9 ? weighted - 9 : weighted;
  }
  return sum % 10 === 0;
}
