import { formatSwedishDate } from './dates.js';
import { nfc } from './swedish-text.js';

/**
 * Pure signature-block helpers — shared by both `KATS_SIGNATUR` and
 * `KATS_YTTRANDE_SIGNATUR`. The only difference between them is how
 * `city` is resolved (see their respective processor modules).
 *
 * VBA reference: `RenderSignatureBlock` and `SwedishDateText` in
 * `KATSUtils.bas` + `Processor_KR_Metadata.bas`.
 */

export const SIGNATURE_FALLBACK_CITY = 'Lund';

export interface SignatureInput {
  readonly date: Date;
  readonly city: string;
  readonly fullName: string;
  readonly title: string;
}

/**
 * Resolve the city to print on the signature line. Priority:
 *   1. `postort` (set by MOTTAGARE processor — present for invoice docs)
 *   2. `userCity` (default city from user DB)
 *   3. fallback constant "Lund"
 *
 * Empty / whitespace-only strings are treated as absent.
 */
export function resolveSignatureCity(
  postort: string | undefined,
  userCity: string,
  fallback: string = SIGNATURE_FALLBACK_CITY,
): string {
  const postortTrimmed = postort?.trim() ?? '';
  if (postortTrimmed.length > 0) return postortTrimmed;
  const userTrimmed = userCity.trim();
  if (userTrimmed.length > 0) return userTrimmed;
  return fallback;
}

/**
 * Build the exact paragraph sequence VBA `RenderSignatureBlock` produces:
 *   [0] "{City} den {day} {monthname} {year}"
 *   [1] ""                                         (empty paragraph = blank line)
 *   [2] full name
 *   [3] title
 *
 * All strings are NFC-normalized so a downstream re-read of the document
 * will loose-match against our own text.
 */
export function buildSignatureParagraphs(
  input: SignatureInput,
): readonly [string, string, string, string] {
  const dateLine = `${nfc(input.city)} den ${formatSwedishDate(input.date)}`;
  return [dateLine, '', nfc(input.fullName), nfc(input.title)];
}
