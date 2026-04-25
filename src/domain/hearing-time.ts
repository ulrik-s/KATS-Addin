import { swedishLoosePattern } from './swedish-text.js';

/**
 * Hearing-time extraction.
 *
 * Drafters write the hearing slot inline in cells like:
 *   "medverkat vid förhandling från kl. 14:30, enligt taxa"
 *   "medverkat vid huvudförhandling från 09.00"
 *
 * Two responsibilities:
 *   1. Detect whether this is a tax case (hearing line contains
 *      "enligt taxa" right after the time).
 *   2. Extract the hearing start time so we can compute hearing duration
 *      from start to "now" (clamped to a 24-hour window).
 *
 * The regex source uses `swedishLoosePattern` so encoding-mangled inputs
 * like "f0rhandling" or "f.rhandling" still match — same behavior as
 * VBA's loose-regex engine (commit 2591a59).
 */

// Build pattern fragments through swedishLoosePattern so å/ä/ö
// auto-degrade to `.` wildcards.
const PRE = swedishLoosePattern('medverkat vid '); // diacritic-safe but no diacritics here
const HF = swedishLoosePattern('förhandling från'); // "f.rhandling fr.n"
const KL = swedishLoosePattern('kl');

const HEARING_BASE = `${PRE}(?:huvud)?${HF}\\s*(?:${KL}\\.?\\s*)?([0-9]{1,2})(?:\\s*[:.]\\s*([0-9]{2}))?`;
const TAXA_TAIL = `\\s*[,;:]?\\s*${swedishLoosePattern('enligt taxa')}\\b`;

const HEARING_TIME_REGEX = new RegExp(HEARING_BASE, 'iu');
const TAXA_HEARING_REGEX = new RegExp(HEARING_BASE + TAXA_TAIL, 'iu');

export interface HearingTime {
  readonly hour: number;
  readonly minute: number;
}

/** True if `text` matches the hearing-line + "enligt taxa" pattern. */
export function isTaxaHearingLine(text: string): boolean {
  return TAXA_HEARING_REGEX.test(text.normalize('NFC'));
}

/** Pull the (hour, minute) of the hearing start from a free-text cell. */
export function extractHearingTime(text: string): HearingTime | undefined {
  const match = HEARING_TIME_REGEX.exec(text.normalize('NFC'));
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return undefined;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return undefined;
  return { hour, minute };
}

/**
 * Minutes elapsed from `start` to `now`, clamped to 0..1440.
 *
 * If `now` is before `start` (e.g. drafting tomorrow's hearing today),
 * VBA wraps by adding 24×60. Same here for parity.
 */
export function elapsedMinutesClamped(start: Date, now: Date): number {
  let diff = Math.floor((now.getTime() - start.getTime()) / 60000);
  if (diff < 0) diff += 24 * 60;
  if (diff < 0) return 0;
  if (diff > 24 * 60) return 24 * 60;
  return diff;
}

/**
 * Build a hearing start `Date` (local time) from a calendar date and a
 * (hour, minute). Used by ARGRUPPER's transform to reconstruct the
 * hearing instant from the row date + parsed time.
 */
export function combineDateAndTime(date: Date, time: HearingTime): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    time.hour,
    time.minute,
    0,
    0,
  );
}
