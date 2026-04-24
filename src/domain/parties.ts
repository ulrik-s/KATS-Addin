import { extractPersonnummer } from './personnummer.js';
import { nfc, normalizeKey } from './swedish-text.js';

/**
 * Parse the free-text block inside `[[KATS_YTTRANDE_PARTER]]`.
 *
 * Expected shape, authored by the drafter:
 *
 *   Left Party Name
 *   ./.
 *   Right Party Name
 *
 *   Left Party Name, NNNNNN-NNNN
 *   Motpart: Right Party Name, NNNNNN-NNNN
 *   Some Other Person, NNNNNN-NNNN
 *
 * Rules (VBA parity):
 *   - Left party  = first non-empty line OR everything before ".//." /
 *     "./." on the very first non-empty line.
 *   - Right party = the line starting with "Motpart:" — the part after
 *     the colon up to (but not including) the first comma.
 *   - All names   = any line matching `NAME, NNNNNN-NNNN`. Deduped by
 *     NFC-lowercased-trimmed key (so "Björn Östlund" and "björn östlund"
 *     collapse; display form is the first one seen).
 *
 * Nothing about this is locale-specific beyond personnummer shape.
 */

export interface ExtractedParties {
  readonly leftParty: string;
  readonly rightParty: string;
  /** Deduplicated, in first-seen order. Empty if no `NAME, pnr` lines matched. */
  readonly allNames: readonly string[];
}

/** Control chars Word sometimes injects into party lists. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const SEPARATOR_PATTERN = /\.\/\./;
const MOTPART_PREFIX = /^motpart\s*:/i;

function normalizeBlock(raw: string): string[] {
  return nfc(raw)
    .replace(/\r\n?|\v/g, '\n')
    .replace(CONTROL_CHARS, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Extract left party from the first non-empty line. */
function extractLeftParty(firstLine: string | undefined): string {
  if (firstLine === undefined) return '';
  const sepIdx = firstLine.search(SEPARATOR_PATTERN);
  if (sepIdx >= 0) {
    return firstLine.slice(0, sepIdx).trim();
  }
  // No separator → the entire first line is the left party name.
  return firstLine.trim();
}

/** Extract right party from a `Motpart:` line, if any. */
function extractRightParty(lines: readonly string[]): string {
  for (const line of lines) {
    if (MOTPART_PREFIX.test(line)) {
      const after = line.replace(MOTPART_PREFIX, '').trim();
      const comma = after.indexOf(',');
      return (comma >= 0 ? after.slice(0, comma) : after).trim();
    }
  }
  return '';
}

/** Pull `NAME, NNNNNN-NNNN` out of a line. */
function parseNameWithPersonnummer(line: string): string | undefined {
  const pnr = extractPersonnummer(line);
  if (pnr === undefined) return undefined;
  const commaIdx = line.indexOf(',');
  if (commaIdx < 0) return undefined;
  const name = line.slice(0, commaIdx).trim();
  // Strip optional "Motpart:" (or similar) prefix from the name part.
  const unprefixed = name.replace(/^motpart\s*:\s*/i, '').trim();
  return unprefixed.length > 0 ? unprefixed : undefined;
}

/** Deduplicate names while preserving first-seen display form. */
function dedupeNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = normalizeKey(name);
    if (key.length === 0) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(nfc(name));
  }
  return out;
}

export function extractParties(raw: string): ExtractedParties {
  const lines = normalizeBlock(raw);
  const leftParty = extractLeftParty(lines[0]);
  const rightParty = extractRightParty(lines);

  const collected: string[] = [];
  if (leftParty.length > 0) collected.push(leftParty);
  if (rightParty.length > 0) collected.push(rightParty);

  for (const line of lines) {
    const name = parseNameWithPersonnummer(line);
    if (name !== undefined) collected.push(name);
  }

  return {
    leftParty: nfc(leftParty),
    rightParty: nfc(rightParty),
    allNames: dedupeNames(collected),
  };
}
