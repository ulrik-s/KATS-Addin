/**
 * Money parsing, formatting, and rounding — Swedish locale.
 *
 * Amounts live in kronor as plain JS numbers. Boundary operations
 * (read-from-cell, write-to-cell, division-by-rate) round explicitly via
 * `roundHalfAwayFromZero` to preserve the VBA Currency-type semantics.
 *
 * Output formatting uses Swedish conventions:
 *   - thousands separator: U+0020 (space)
 *   - decimal separator:   U+002C (comma)
 *   - currency suffix:     " kr"
 *
 * Input parsing accepts both Swedish ("1 234,56") and English
 * ("1,234.56") number formats. The disambiguation rules:
 *
 *   1. Both `,` and `.` present  → last occurrence is the decimal
 *      separator; earlier separators of either type are thousands
 *      groupings (dropped).
 *
 *   2. Single separator type, repeated as `\d{1,3}(sep\d{3})+` with
 *      nothing else                → unambiguous thousands pattern.
 *      Drop separators. Handles both English "1,597" → 1597 and the
 *      Swedish "1.597" thousand-form. Catches the common case where
 *      utlägg amounts are entered with a leading thousand separator.
 *
 *   3. Otherwise (single separator that doesn't fit the thousands
 *      pattern, e.g. "1,5" / "0,50" / "850,75")
 *                                  → treat the separator as decimal
 *      (legacy Swedish behavior).
 */

/**
 * Parse a Swedish-or-English-style number from free-form cell text.
 * Strips everything that isn't a digit, a leading minus, or a
 * decimal separator. Empty / unparseable input → 0.
 *
 * Mixed-separator strings ("1,597.00" English / "1.597,50" Swedish):
 * the LAST `,` or `.` in the string is taken as the decimal separator;
 * any earlier `,` / `.` are treated as thousands separators and dropped.
 * Strings with only one separator type ("1,500" or "1.500") fall back
 * to legacy "single separator = decimal" behavior — there's no way to
 * disambiguate Swedish 1.5 from English 1500 without more context.
 */
/** Pure thousands-grouping (no decimal): `1,597`, `1,000,000`, `1.597`, etc. */
const PURE_THOUSANDS_RE = /^-?\d{1,3}((?<sep>[,.])\d{3})(\k<sep>\d{3})*$/;

export function svToNumber(raw: string): number {
  const s = raw.trim();
  if (s.length === 0) return 0;

  // Strip non-essential characters (spaces, "kr", currency markers)
  // before pattern-matching so heuristics aren't fooled by suffixes.
  // Keep digits, sign, and separators.
  const compact = s.replace(/[^\d,.-]/g, '');
  const decimalIndex = pickDecimalIndex(compact);

  let out = '';
  for (let i = 0; i < compact.length; i += 1) {
    const ch = compact.charAt(i);
    if (ch === '-' && out.length === 0) {
      out += '-';
    } else if (ch >= '0' && ch <= '9') {
      out += ch;
    } else if ((ch === ',' || ch === '.') && i === decimalIndex) {
      out += '.';
    }
    // Any other separator occurrence (wrong type or non-decimal-index
    // same-type) is treated as a thousands separator and dropped.
  }

  if (out === '' || out === '-' || out === '.' || out === '-.') return 0;
  const n = Number(out);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Decide which `,` / `.` index in `compact` is the decimal point.
 * Returns -1 when there is no decimal (i.e. the string is integer-only
 * or a pure thousands-grouping pattern).
 */
function pickDecimalIndex(compact: string): number {
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  const hasComma = lastComma !== -1;
  const hasDot = lastDot !== -1;

  // Mixed: last separator wins.
  if (hasComma && hasDot) return Math.max(lastComma, lastDot);

  // Single-type, but matches the pure-thousands grouping pattern → no
  // decimal. "1,597" / "1.597" / "1,000,000" / "1.000.000" all qualify.
  if ((hasComma || hasDot) && PURE_THOUSANDS_RE.test(compact)) return -1;

  // Single separator that doesn't fit thousands grouping → it is the decimal.
  if (hasComma) return lastComma;
  if (hasDot) return lastDot;
  return -1;
}

/**
 * Half-away-from-zero rounding, returning an integer.
 * `0.5 → 1`, `-0.5 → -1`, `-1.5 → -2`. Diverges from `Math.round`
 * which rounds `-0.5 → 0` (half-toward-positive-infinity).
 */
export function roundHalfAwayFromZero(v: number): number {
  if (v >= 0) return Math.floor(v + 0.5);
  return -Math.floor(-v + 0.5);
}

/** Round a value to a fixed number of decimals via half-away-from-zero. */
export function roundToDecimals(v: number, decimals: number): number {
  const safeDecimals = decimals >= 0 && decimals <= 6 ? decimals : 2;
  const scale = 10 ** safeDecimals;
  return roundHalfAwayFromZero(v * scale) / scale;
}

/** Format an integer as `4 209` — thousand-spaces, no decimals. */
export function formatSvInt(n: number): string {
  const i = roundHalfAwayFromZero(n);
  const negative = i < 0;
  const abs = Math.abs(i).toString();

  let out = '';
  for (let pos = abs.length - 1, count = 0; pos >= 0; pos -= 1, count += 1) {
    out = abs.charAt(pos) + out;
    if ((count + 1) % 3 === 0 && pos > 0) out = ' ' + out;
  }
  return negative ? '-' + out : out;
}

/**
 * Format with N decimals using Swedish notation: `1234.5` with decimals=2
 * → `"1234,50"` (no thousand separator — matches VBA `FormatSvDecimal`).
 */
export function formatSvDecimal(v: number, decimals: number): string {
  const safeDecimals = decimals >= 0 && decimals <= 6 ? decimals : 2;
  const rounded = roundToDecimals(v, safeDecimals);
  // toFixed uses standard banker's rounding internally on the doubled
  // value but our `rounded` is already correctly rounded — toFixed just
  // formats. Replace `.` with `,`.
  return rounded.toFixed(safeDecimals).replace('.', ',');
}

/**
 * Format as a Swedish money amount: `4 209,57 kr`. Exactly 2 decimals,
 * thousand-spaces on the kronor part. Negative values get a leading `-`.
 *
 * Mirrors VBA `FormatSvMoney` byte-for-byte.
 */
export function formatSvMoney(v: number): string {
  const rounded = roundToDecimals(v, 2);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);

  // Avoid floating-point quirks at the kr/öre boundary by going through
  // an integer öre representation.
  const totalOre = roundHalfAwayFromZero(abs * 100);
  const kronor = Math.floor(totalOre / 100);
  const ore = totalOre % 100;

  const krStr = formatSvInt(kronor);
  const oreStr = ore.toString().padStart(2, '0');
  const out = `${krStr},${oreStr} kr`;
  return negative ? `-${out}` : out;
}

/** True if the string contains at least one digit 0-9. */
export function hasAnyDigit(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const ch = s.charCodeAt(i);
    if (ch >= 48 && ch <= 57) return true;
  }
  return false;
}
