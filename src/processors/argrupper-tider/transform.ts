import {
  combineDateAndTime,
  elapsedMinutesClamped,
  extractHearingTime,
  isTaxaHearingLine,
} from '../../domain/hearing-time.js';
import { looksLikeIsoDate, parseIsoDate } from '../../domain/iso-date.js';
import { formatSvDecimal, roundToDecimals, svToNumber } from '../../domain/money.js';
import { swedishLooseContains, swedishLooseEquals } from '../../domain/swedish-text.js';
import {
  ARENDE_TOTAL_LABEL,
  ARGRUPPER_HOURS_COL,
  ARGRUPPER_SECTIONS,
  type ArgrupperRead,
  type ArgrupperState,
  type CellPatch,
  type CategoryHours,
} from './schema.js';

/**
 * Pure transform for ARGRUPPER. Processes the time-grouped table:
 *
 *   - For each section (Arvode / Arvode helg / Tidsspillan /
 *     Tidsspillan övrig tid), sum the hours column between the heading
 *     and the next "Summa" row, and write the rounded total back to
 *     the summary row.
 *   - Scan every cell for "enligt taxa" (loose) → tax case flag.
 *   - Scan every cell for the hearing-time pattern → capture start
 *     time, compute hearing minutes (relative to `now`).
 *   - Clear the "Ärende, total" row's first three cells.
 */
export interface ComputeArgrupperInput {
  readonly read: ArgrupperRead;
  readonly now: Date;
}

const HOURS_DECIMALS = 2;

export function computeArgrupper(input: ComputeArgrupperInput): ArgrupperState {
  const { cells } = input.read;
  const patches: CellPatch[] = [];

  // 1. Tax case detection — any cell containing the regex.
  const isTaxemal = cells.some((row) => row.some((cell) => isTaxaHearingLine(cell.join('\r'))));

  // 2. Hearing time capture.
  const hearing = captureHearingStart(cells, input.now, patches);

  // 3. Per-category hour sums + summary patches.
  const hours = computeAllCategoryHours(cells, patches);

  // 4. Clear "Ärende, total" row (first 3 columns).
  const totalRow = findArendeTotalRow(cells);
  if (totalRow >= 0) {
    for (let col = 0; col < 3; col += 1) {
      patches.push({ row: totalRow, col, paragraphs: [] });
    }
  }

  return {
    hours,
    isTaxemal,
    ...(hearing.start !== undefined ? { hearingStart: hearing.start } : {}),
    ...(hearing.minutes !== undefined ? { hearingMinutes: hearing.minutes } : {}),
    patches,
  };
}

interface HearingResult {
  readonly start?: Date;
  readonly minutes?: number;
}

function captureHearingStart(
  cells: readonly (readonly (readonly string[])[])[],
  now: Date,
  patches: CellPatch[],
): HearingResult {
  for (let r = 0; r < cells.length; r += 1) {
    const row = cells[r];
    if (!row) continue;
    for (const cell of row) {
      const text = cell.join('\r');
      const time = extractHearingTime(text);
      if (!time) continue;

      // Date column is 0; use today if absent or unparseable.
      const dateText = row[0]?.join('\r') ?? '';
      const baseDate = looksLikeIsoDate(dateText)
        ? (parseIsoDate(dateText) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate()))
        : new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const start = combineDateAndTime(baseDate, time);
      const minutes = elapsedMinutesClamped(start, now);

      // Write computed hours back to col 2 of this row.
      patches.push({
        row: r,
        col: ARGRUPPER_HOURS_COL,
        paragraphs: [formatSvDecimal(minutes / 60, 2)],
      });
      return { start, minutes };
    }
  }
  return {};
}

function computeAllCategoryHours(
  cells: readonly (readonly (readonly string[])[])[],
  patches: CellPatch[],
): CategoryHours {
  return {
    arvode: computeSectionHours(cells, ARGRUPPER_SECTIONS.arvode, patches),
    arvodeHelg: computeSectionHours(cells, ARGRUPPER_SECTIONS.arvodeHelg, patches),
    tidsspillan: computeSectionHours(cells, ARGRUPPER_SECTIONS.tidsspillan, patches),
    tidsspillanOvrigTid: computeSectionHours(
      cells,
      ARGRUPPER_SECTIONS.tidsspillanOvrigTid,
      patches,
    ),
  };
}

function computeSectionHours(
  cells: readonly (readonly (readonly string[])[])[],
  label: string,
  patches: CellPatch[],
): number {
  const headingRow = findHeadingRow(cells, label);
  if (headingRow < 0) return 0;
  const summaryRow = findSummaryRowAfter(cells, headingRow);
  if (summaryRow < 0) return 0;

  let sum = 0;
  for (let r = headingRow + 1; r < summaryRow; r += 1) {
    const dateText = cellText(cells, r, 0);
    if (!looksLikeIsoDate(dateText)) continue;
    sum += svToNumber(cellText(cells, r, ARGRUPPER_HOURS_COL));
  }
  const rounded = roundToDecimals(sum, HOURS_DECIMALS);
  patches.push({
    row: summaryRow,
    col: ARGRUPPER_HOURS_COL,
    paragraphs: [formatSvDecimal(rounded, HOURS_DECIMALS)],
  });
  return rounded;
}

function cellText(
  cells: readonly (readonly (readonly string[])[])[],
  row: number,
  col: number,
): string {
  return cells[row]?.[col]?.join('\r') ?? '';
}

function findHeadingRow(cells: readonly (readonly (readonly string[])[])[], label: string): number {
  for (let r = 0; r < cells.length; r += 1) {
    const row = cells[r];
    if (!row) continue;
    const nonEmpty = row.map((cell) => cell.join('\r').trim()).filter((t) => t.length > 0);
    if (nonEmpty.length === 0) continue;
    if (nonEmpty.every((t) => swedishLooseEquals(t, label))) return r;
  }
  return -1;
}

function findSummaryRowAfter(
  cells: readonly (readonly (readonly string[])[])[],
  headingRow: number,
): number {
  for (let r = headingRow + 1; r < cells.length; r += 1) {
    if (swedishLooseEquals(cellText(cells, r, 0).trim(), 'Summa')) return r;
  }
  return -1;
}

function findArendeTotalRow(cells: readonly (readonly (readonly string[])[])[]): number {
  for (let r = 0; r < cells.length; r += 1) {
    if (swedishLooseContains(cellText(cells, r, 0), ARENDE_TOTAL_LABEL)) return r;
  }
  return -1;
}
