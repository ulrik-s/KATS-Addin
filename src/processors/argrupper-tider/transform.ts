import {
  combineDateAndTime,
  elapsedMinutesClamped,
  extractHearingTime,
  isTaxaHearingLine,
} from '../../domain/hearing-time.js';
import { looksLikeIsoDate, parseIsoDate } from '../../domain/iso-date.js';
import { formatSvDecimal, roundToDecimals, svToNumber } from '../../domain/money.js';
import {
  type LabelSpec,
  canonicalLabelOrNull,
  labelPrimary,
  swedishLooseContainsAny,
  swedishLooseEqualsAny,
} from '../../domain/swedish-text.js';
import {
  ARENDE_TOTAL_LABEL,
  ARGRUPPER_HOURS_COL,
  ARGRUPPER_SECTIONS,
  ARGRUPPER_SUMMARY_LABEL,
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
 *
 * All label matches accept English (and other) aliases via
 * `swedishLooseEqualsAny`. When a section heading is recognized but its
 * summary row isn't (or vice versa for the table as a whole), a
 * user-facing warning is emitted into `state.warnings`.
 */
export interface ComputeArgrupperInput {
  readonly read: ArgrupperRead;
  readonly now: Date;
}

const HOURS_DECIMALS = 2;

export function computeArgrupper(input: ComputeArgrupperInput): ArgrupperState {
  const { cells } = input.read;
  const patches: CellPatch[] = [];
  const warnings: string[] = [];

  // 1. Tax case detection — any cell containing the regex.
  const isTaxemal = cells.some((row) => row.some((cell) => isTaxaHearingLine(cell.join('\r'))));

  // 2. Hearing time capture.
  const hearing = captureHearingStart(cells, input.now, patches);

  // 3. Per-category hour sums + summary patches.
  const hours = computeAllCategoryHours(cells, patches, warnings);

  // 4. Clear "Ärende, total" row (first 3 columns).
  const totalRow = findArendeTotalRow(cells);
  if (totalRow >= 0) {
    for (let col = 0; col < 3; col += 1) {
      patches.push({ row: totalRow, col, paragraphs: [] });
    }
  }

  // 5. Sanity check: if the table contains date rows but no section was
  // recognized at all, the headings have probably drifted beyond what
  // even our alias list catches.
  if (sumAll(hours) === 0 && !anySectionPresent(cells) && hasDataRows(cells)) {
    warnings.push(
      'ARGRUPPER-tabellen ser ut att innehålla data men ingen sektionsrubrik hittades — ' +
        `kontrollera att rubriken heter "${labelPrimary(ARGRUPPER_SECTIONS.arvode)}" ` +
        `eller "${labelPrimary(ARGRUPPER_SECTIONS.tidsspillan)}".`,
    );
  }

  return {
    hours,
    isTaxemal,
    ...(hearing.start !== undefined ? { hearingStart: hearing.start } : {}),
    ...(hearing.minutes !== undefined ? { hearingMinutes: hearing.minutes } : {}),
    patches,
    warnings,
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
  warnings: string[],
): CategoryHours {
  return {
    arvode: computeSectionHours(cells, ARGRUPPER_SECTIONS.arvode, patches, warnings),
    arvodeHelg: computeSectionHours(cells, ARGRUPPER_SECTIONS.arvodeHelg, patches, warnings),
    tidsspillan: computeSectionHours(cells, ARGRUPPER_SECTIONS.tidsspillan, patches, warnings),
    tidsspillanOvrigTid: computeSectionHours(
      cells,
      ARGRUPPER_SECTIONS.tidsspillanOvrigTid,
      patches,
      warnings,
    ),
  };
}

function computeSectionHours(
  cells: readonly (readonly (readonly string[])[])[],
  section: LabelSpec,
  patches: CellPatch[],
  warnings: string[],
): number {
  const headingRow = findHeadingRow(cells, section);
  if (headingRow < 0) return 0;

  // Rewrite alias heading text back to canonical Swedish (e.g.
  // "Fee" → "Arvode") so the rendered doc is monolingual.
  pushLabelRewriteIfNeeded(cells, headingRow, section, patches);

  const summaryRow = findSummaryRowAfter(cells, headingRow);
  if (summaryRow < 0) {
    warnings.push(
      `ARGRUPPER: rubriken "${labelPrimary(section)}" hittades men summaraden ` +
        `("${labelPrimary(ARGRUPPER_SUMMARY_LABEL)}") saknas — sektionen ignorerades.`,
    );
    return 0;
  }

  // Same for the summary row label ("Total" → "Summa").
  pushLabelRewriteIfNeeded(cells, summaryRow, ARGRUPPER_SUMMARY_LABEL, patches);

  let sum = 0;
  for (let r = headingRow + 1; r < summaryRow; r += 1) {
    const dateText = cellText(cells, r, 0);
    if (!looksLikeIsoDate(dateText)) continue;
    const hours = svToNumber(cellText(cells, r, ARGRUPPER_HOURS_COL));
    sum += hours;
    // Normalize the hours cell to canonical Swedish format. The user
    // may have typed "0.75" (English period decimal); we render as
    // "0,75" so the document is monolingual.
    if (hours !== 0) {
      patches.push({
        row: r,
        col: ARGRUPPER_HOURS_COL,
        paragraphs: [formatSvDecimal(hours, HOURS_DECIMALS)],
      });
    }
  }
  const rounded = roundToDecimals(sum, HOURS_DECIMALS);
  patches.push({
    row: summaryRow,
    col: ARGRUPPER_HOURS_COL,
    paragraphs: [formatSvDecimal(rounded, HOURS_DECIMALS)],
  });
  return rounded;
}

/**
 * Append a col-0 patch rewriting an aliased label to its primary
 * Swedish form. No-op when the cell already matches the primary
 * (case- and diacritic-insensitively) or is empty.
 */
function pushLabelRewriteIfNeeded(
  cells: readonly (readonly (readonly string[])[])[],
  row: number,
  spec: LabelSpec,
  patches: CellPatch[],
): void {
  const canonical = canonicalLabelOrNull(cellText(cells, row, 0), spec);
  if (canonical === null) return;
  patches.push({ row, col: 0, paragraphs: [canonical] });
}

function cellText(
  cells: readonly (readonly (readonly string[])[])[],
  row: number,
  col: number,
): string {
  return cells[row]?.[col]?.join('\r') ?? '';
}

function findHeadingRow(
  cells: readonly (readonly (readonly string[])[])[],
  section: LabelSpec,
): number {
  for (let r = 0; r < cells.length; r += 1) {
    const row = cells[r];
    if (!row) continue;
    const nonEmpty = row.map((cell) => cell.join('\r').trim()).filter((t) => t.length > 0);
    if (nonEmpty.length === 0) continue;
    if (nonEmpty.every((t) => swedishLooseEqualsAny(t, section))) return r;
  }
  return -1;
}

function findSummaryRowAfter(
  cells: readonly (readonly (readonly string[])[])[],
  headingRow: number,
): number {
  for (let r = headingRow + 1; r < cells.length; r += 1) {
    if (swedishLooseEqualsAny(cellText(cells, r, 0).trim(), ARGRUPPER_SUMMARY_LABEL)) return r;
  }
  return -1;
}

function findArendeTotalRow(cells: readonly (readonly (readonly string[])[])[]): number {
  for (let r = 0; r < cells.length; r += 1) {
    if (swedishLooseContainsAny(cellText(cells, r, 0), ARENDE_TOTAL_LABEL)) return r;
  }
  return -1;
}

function sumAll(h: CategoryHours): number {
  return h.arvode + h.arvodeHelg + h.tidsspillan + h.tidsspillanOvrigTid;
}

/** True if any of the four section headings is present anywhere in the table. */
function anySectionPresent(cells: readonly (readonly (readonly string[])[])[]): boolean {
  for (const section of Object.values(ARGRUPPER_SECTIONS)) {
    if (findHeadingRow(cells, section) >= 0) return true;
  }
  return false;
}

/** True if at least one row's col 0 looks like an ISO date. */
function hasDataRows(cells: readonly (readonly (readonly string[])[])[]): boolean {
  for (let r = 0; r < cells.length; r += 1) {
    if (looksLikeIsoDate(cellText(cells, r, 0))) return true;
  }
  return false;
}
