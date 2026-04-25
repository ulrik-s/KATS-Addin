import { svToNumber } from './money.js';

/**
 * Parse a rate from a cell like `"2,5 á 850 kr"`.
 *
 * VBA-parity behavior (commit 86d0ca6):
 *   - Look for `á` (U+00E1) first.
 *   - Fall back to `à` (U+00E0) for ancient docs.
 *   - If neither separator is present, parse the entire string as a
 *     bare number — supports cells that already hold "850" without the
 *     hour-multiplier prefix.
 *
 * Note: we deliberately do NOT fall back to plain ASCII `a` (rejected
 * after f309108 → 86d0ca6 because of false positives on prose words).
 */
export function parseRateKr(s: string): number {
  const text = s.normalize('NFC');
  for (const sep of ['\u00e1', '\u00e0']) {
    const idx = text.indexOf(sep);
    if (idx >= 0) return svToNumber(text.slice(idx + 1));
  }
  return svToNumber(text);
}

/** Format a hourly-rate row spec: `"1,50 á 850 kr"`. */
export function formatRateSpec(hours: number, ratePerHour: number): string {
  const decimalsForHours = 2;
  const intRate = Math.round(ratePerHour);
  return `${hours.toFixed(decimalsForHours).replace('.', ',')} \u00e1 ${formatPlainSvInt(
    intRate,
  )} kr`;
}

/** Internal — rate display always uses thousands-spaces for kr value. */
function formatPlainSvInt(n: number): string {
  const negative = n < 0;
  const abs = Math.abs(n).toString();
  let out = '';
  for (let pos = abs.length - 1, count = 0; pos >= 0; pos -= 1, count += 1) {
    out = abs.charAt(pos) + out;
    if ((count + 1) % 3 === 0 && pos > 0) out = ' ' + out;
  }
  return negative ? '-' + out : out;
}
