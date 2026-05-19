import {
  combineDateAndTime,
  elapsedMinutesClamped,
  extractHearingTime,
  isTaxaHearingLine,
} from '../../domain/hearing-time.js';
import { looksLikeIsoDate } from '../../domain/iso-date.js';
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

  // 2. Hearing time capture. Emit the cell-patch here (not inside the
  //    capture helper) so we can also build the row→hours override map
  //    that downstream section-sum + 0-hour-detection use to stay
  //    consistent with what the user will actually see in the cell.
  const hearing = captureHearingStart(cells, input.now);
  const hourOverrides = new Map<number, number>();
  if (hearing.rowIndex !== undefined && hearing.minutes !== undefined && hearing.minutes > 0) {
    const computedHours = roundToDecimals(hearing.minutes / 60, HOURS_DECIMALS);
    hourOverrides.set(hearing.rowIndex, computedHours);
    patches.push({
      row: hearing.rowIndex,
      col: ARGRUPPER_HOURS_COL,
      paragraphs: [formatSvDecimal(computedHours, HOURS_DECIMALS)],
    });
  }

  // 3. Per-category hour sums + summary patches.
  const hours = computeAllCategoryHours(cells, patches, warnings, hourOverrides);

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
  /** Row that contained the hearing line — populated only on a hit. */
  readonly rowIndex?: number;
}

/**
 * Find the first cell whose text matches the hearing-line regex
 * (`Medverkat vid förhandling från kl XX(:YY)`) and return:
 *
 *   - `start`     = TODAY at HH:MM (NOW's calendar date — the row's
 *                   own date column is intentionally ignored: "from
 *                   kl XX till nu" semantically means same-day),
 *   - `minutes`   = elapsed clock-minutes from `start` to `now`,
 *                   clamped to [0, 1440],
 *   - `rowIndex`  = the matched row, so callers can patch its hours
 *                   cell with `minutes / 60`.
 *
 * `minutes === 0` means the hearing has not happened yet today; the
 * caller skips the cell-patch (writing "0,00" would be misleading)
 * and lets the 0-hour warning surface the missing input.
 */
function captureHearingStart(
  cells: readonly (readonly (readonly string[])[])[],
  now: Date,
): HearingResult {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let r = 0; r < cells.length; r += 1) {
    const row = cells[r];
    if (!row) continue;
    for (const cell of row) {
      const text = cell.join('\r');
      const time = extractHearingTime(text);
      if (!time) continue;
      const start = combineDateAndTime(today, time);
      const minutes = elapsedMinutesClamped(start, now);
      return { start, minutes, rowIndex: r };
    }
  }
  return {};
}

function computeAllCategoryHours(
  cells: readonly (readonly (readonly string[])[])[],
  patches: CellPatch[],
  warnings: string[],
  hourOverrides: ReadonlyMap<number, number>,
): CategoryHours {
  const args = { cells, patches, warnings, hourOverrides } as const;
  return {
    arvode: computeSectionHours(args, ARGRUPPER_SECTIONS.arvode),
    arvodeHelg: computeSectionHours(args, ARGRUPPER_SECTIONS.arvodeHelg),
    tidsspillan: computeSectionHours(args, ARGRUPPER_SECTIONS.tidsspillan),
    tidsspillanOvrigTid: computeSectionHours(args, ARGRUPPER_SECTIONS.tidsspillanOvrigTid),
  };
}

interface SectionContext {
  readonly cells: readonly (readonly (readonly string[])[])[];
  readonly patches: CellPatch[];
  readonly warnings: string[];
  /**
   * Row → hours overrides that take precedence over the cell's parsed
   * value when summing, detecting 0-hour rows, and deciding whether to
   * emit a normalization patch. Populated upstream from hearing
   * capture so the section logic stays consistent with what will
   * actually render in the cell.
   */
  readonly hourOverrides: ReadonlyMap<number, number>;
}

function computeSectionHours(ctx: SectionContext, section: LabelSpec): number {
  const { cells, patches, warnings, hourOverrides } = ctx;
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
  const zeroHourDates: string[] = [];
  for (let r = headingRow + 1; r < summaryRow; r += 1) {
    const dateText = cellText(cells, r, 0);
    if (!looksLikeIsoDate(dateText)) continue;
    // Effective hours = the value the user will actually see in the
    // cell after render: either an upstream override (hearing-line
    // auto-fill) or the parsed cell value. The override-patch is
    // already in `patches`; we just need to use the same value here
    // for the sum + 0-hour detection.
    const override = hourOverrides.get(r);
    const cellHours = svToNumber(cellText(cells, r, ARGRUPPER_HOURS_COL));
    const hours = override ?? cellHours;
    sum += hours;
    if (hours === 0) {
      // Flag the date for a section-level "missing hours" warning at
      // the end of the loop. A 0-hour data row is almost always an
      // input error — forgotten field, parser confused by an exotic
      // separator, etc.
      zeroHourDates.push(dateText.trim());
    } else if (override === undefined) {
      // Cell-source value: normalize the cell to canonical Swedish
      // format. (Override-rows already had their patch pushed by the
      // hearing-capture step.)
      patches.push({
        row: r,
        col: ARGRUPPER_HOURS_COL,
        paragraphs: [formatSvDecimal(hours, HOURS_DECIMALS)],
      });
    }
  }
  if (zeroHourDates.length > 0) {
    warnings.push(buildZeroHoursWarning(section, zeroHourDates));
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
 * Build the user-facing warning for a section whose data rows
 * contained one or more 0-hour entries. Single source of truth so
 * every section (Arvode, Tidsspillan, …) phrases the warning the
 * same way.
 */
function buildZeroHoursWarning(section: LabelSpec, dates: readonly string[]): string {
  const noun = dates.length === 1 ? 'post' : 'poster';
  return (
    `ARGRUPPER (${labelPrimary(section)}): ${String(dates.length)} ${noun} med 0,00 timmar ` +
    `— kontrollera ${dates.join(', ')}.`
  );
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
