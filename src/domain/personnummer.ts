/**
 * Swedish personal identity number (personnummer) utilities.
 *
 * Format in KATS templates: `NNNNNN-NNNN` — six digits (YYMMDD-part),
 * a dash, then four digits. The VBA only checks the structural format,
 * not the Luhn checksum or date validity; we match that semantics for
 * parity but expose `hasValidChecksum` too for future tightening.
 */

/** Strict `NNNNNN-NNNN` regex. No whitespace in the middle, no plus sign. */
export const PERSONNUMMER_PATTERN = /\b(\d{6})-(\d{4})\b/;

/** Same, but allowed to appear anywhere in a string (used for name-line parsing). */
export const PERSONNUMMER_PATTERN_GLOBAL = /\b(\d{6})-(\d{4})\b/g;

/** True if `s` exactly equals `NNNNNN-NNNN`. */
export function isPersonnummerExact(s: string): boolean {
  return /^\d{6}-\d{4}$/.test(s.trim());
}

/** Extract the first personnummer occurrence from a line, or undefined. */
export function extractPersonnummer(line: string): string | undefined {
  const match = PERSONNUMMER_PATTERN.exec(line);
  return match ? `${match[1] ?? ''}-${match[2] ?? ''}` : undefined;
}

/**
 * Luhn checksum validation. Not used for acceptance yet (VBA parity),
 * but available for stricter validation paths.
 */
export function hasValidChecksum(pnr: string): boolean {
  const digits = pnr.replace(/-/g, '');
  if (!/^\d{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const d = Number(digits.charAt(i));
    const weighted = i % 2 === 0 ? d * 2 : d;
    sum += weighted > 9 ? weighted - 9 : weighted;
  }
  return sum % 10 === 0;
}
