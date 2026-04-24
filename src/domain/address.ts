import { nfc } from './swedish-text.js';

/**
 * Address/recipient-block parsing. The VBA MOTTAGARE processor reads a
 * 1×2 table cell containing free-form recipient text like:
 *
 *   Tingsrätten i Malmö\r
 *   Box 847\r
 *   201 24  Malmö\r
 *
 * The first non-empty line becomes the recipient name (reused in render).
 * The `### ## CITY` line produces the postort used later by SIGNATUR.
 */

/** Control chars we strip so downstream regex sees clean text. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * Normalize a block of free-form text:
 *   - NFC
 *   - remove control chars (Chr(7) and friends appear in legacy docs)
 *   - collapse CRLF / LF / VT into single `\n`
 *   - trim trailing whitespace from each line
 */
export function normalizeAddressText(raw: string): string {
  // Convert line endings *before* stripping control chars — the control-char
  // regex intentionally includes Chr(7) etc. but must not eat \v (VT)
  // which Word uses as an alternate paragraph separator.
  return nfc(raw)
    .replace(/\r\n?|\v/g, '\n')
    .replace(CONTROL_CHARS, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
}

/** Split into lines and drop empty ones. */
export function extractNonEmptyLines(text: string): string[] {
  return normalizeAddressText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Extract the postort from an address block. Matches the VBA pattern
 *   ### ## CITY
 * i.e. 3 digits, 1+ spaces, 2 digits, 1+ spaces, then the rest of the
 * line is the city. Returns the city title-cased or empty string when
 * no postcode line is present.
 */
export function extractPostort(text: string): string {
  const normalized = normalizeAddressText(text);
  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim();
    const match = /^\d{3}\s+\d{2}\s+(.+)$/.exec(line);
    if (match) {
      const city = match[1];
      if (city !== undefined) return titleCaseCity(city);
    }
  }
  return '';
}

/**
 * Title-case each word in a city name. "malmö" → "Malmö"; "BRÖNDBY
 * STRAND" → "Bröndby Strand". Internal whitespace runs are collapsed.
 */
export function titleCaseCity(raw: string): string {
  return nfc(raw)
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((word) => {
      const first = word.charAt(0).toUpperCase();
      const rest = word.slice(1).toLowerCase();
      return first + rest;
    })
    .join(' ');
}

/**
 * Full parse of the recipient block — returns both the first line (for
 * render) and the postort (for downstream processors). An empty `firstLine`
 * result is treated as an error by MOTTAGARE's read phase.
 */
export interface ParsedAddressBlock {
  readonly firstLine: string;
  readonly postort: string;
}

export function parseAddressBlock(raw: string): ParsedAddressBlock {
  const lines = extractNonEmptyLines(raw);
  const firstLine = lines[0] ?? '';
  const postort = extractPostort(raw);
  return { firstLine, postort };
}
