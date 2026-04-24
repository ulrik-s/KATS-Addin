/**
 * Swedish-aware text utilities.
 *
 * Word may deliver text in NFC, NFD, or mixed Unicode normalization depending
 * on platform (Mac vs PC), source (typed vs pasted), and font. Any comparison
 * against å/ä/ö must normalize first or it silently fails on some docs.
 *
 * `swedishLoose*` helpers mirror the VBA-era `SwedishLooseRegex` behavior:
 * diacritics in the *pattern* become `.` wildcards, so a hardcoded needle
 * like "förhandling" also matches "forhandling" / "f0rhandling" that a
 * legacy template could contain.
 */

const SWEDISH_DIACRITICS = new Set(['å', 'ä', 'ö', 'Å', 'Ä', 'Ö']);
const REGEX_SPECIAL_CHARS = new Set([
  '.',
  '*',
  '+',
  '?',
  '^',
  '$',
  '{',
  '}',
  '(',
  ')',
  '|',
  '[',
  ']',
  '\\',
]);

/** NFC-normalize. All user-facing output should go through this. */
export function nfc(s: string): string {
  return s.normalize('NFC');
}

/** Case-insensitive equality after NFC normalization. */
export function swedishEquals(a: string, b: string): boolean {
  return nfc(a).toLowerCase() === nfc(b).toLowerCase();
}

/**
 * Build a regex source string where Swedish diacritics are replaced with `.`
 * and regex specials are escaped. Input is NFC-normalized first.
 */
export function swedishLoosePattern(needle: string): string {
  let out = '';
  for (const ch of nfc(needle)) {
    if (SWEDISH_DIACRITICS.has(ch)) {
      out += '.';
    } else if (REGEX_SPECIAL_CHARS.has(ch)) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Compile a loose regex from a human-readable needle. Default flags: case-insensitive + Unicode. */
export function looseRegex(needle: string, flags = 'iu'): RegExp {
  return new RegExp(swedishLoosePattern(needle), flags);
}

/** Loose `.includes()` equivalent. Empty needle returns true. */
export function swedishLooseContains(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  return looseRegex(needle).test(nfc(haystack));
}

/** Loose equality, tolerant of leading/trailing whitespace. */
export function swedishLooseEquals(haystack: string, needle: string): boolean {
  const pattern = '^\\s*' + swedishLoosePattern(needle) + '\\s*$';
  return new RegExp(pattern, 'iu').test(nfc(haystack));
}

/**
 * Canonical form for keyed lookups (e.g. dedup party names): NFC + lowercase
 * + collapsed internal whitespace + trimmed. Diacritics are preserved.
 */
export function normalizeKey(s: string): string {
  return nfc(s).toLowerCase().replace(/\s+/g, ' ').trim();
}
