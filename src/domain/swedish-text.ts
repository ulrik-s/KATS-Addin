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

/**
 * A label with its primary (canonical) form plus alternative spellings
 * accepted as equivalent. Used by table processors so that drafts whose
 * headings have been translated, abbreviated, or otherwise drifted still
 * match. The primary form is what is shown back to users in diagnostic
 * messages — aliases are silent fallbacks.
 */
export interface LabelSpec {
  readonly primary: string;
  readonly aliases?: readonly string[];
}

/** Accept either a bare string (no aliases) or a full LabelSpec. */
export type LabelLike = string | LabelSpec;

/** Flatten a LabelLike into the list of variants to try. */
export function labelVariants(spec: LabelLike): readonly string[] {
  if (typeof spec === 'string') return [spec];
  return [spec.primary, ...(spec.aliases ?? [])];
}

/** Primary (display) form of a LabelLike. */
export function labelPrimary(spec: LabelLike): string {
  return typeof spec === 'string' ? spec : spec.primary;
}

/** Loose equality where any variant in `spec` may match. */
export function swedishLooseEqualsAny(haystack: string, spec: LabelLike): boolean {
  return labelVariants(spec).some((v) => swedishLooseEquals(haystack, v));
}

/** Loose `.includes()` where any variant in `spec` may match. */
export function swedishLooseContainsAny(haystack: string, spec: LabelLike): boolean {
  return labelVariants(spec).some((v) => swedishLooseContains(haystack, v));
}

/**
 * Decide whether `currentText` should be rewritten to the canonical
 * Swedish form of `spec`. Returns the primary form when `currentText`
 * looks like an alias (or some other drifted spelling) that doesn't
 * loose-equal the primary; returns null when the text is already
 * canonical (case- and diacritic-insensitively) or empty.
 *
 * Used by table processors to write Swedish back over English drafts:
 * matching is forgiving, but the rendered document should always end up
 * in canonical Swedish.
 */
export function canonicalLabelOrNull(currentText: string, spec: LabelSpec): string | null {
  const trimmed = nfc(currentText).trim();
  if (trimmed.length === 0) return null;
  if (swedishLooseEquals(trimmed, spec.primary)) return null;
  return spec.primary;
}
