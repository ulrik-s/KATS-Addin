import { formatSvMoney, hasAnyDigit, roundToDecimals, svToNumber } from '../../domain/money.js';
import { formatRateSpec, parseRateKr } from '../../domain/rate.js';
import { formatHoursAndMinutes, getTaxaAmount } from '../../domain/taxa.js';
import { type CategoryHours } from '../argrupper-tider/schema.js';
import {
  ARVODE_COL,
  ARVODE_ROW,
  type ArvodeRead,
  type ArvodeState,
  type CellPatch,
} from './schema.js';

/**
 * Pure transform for ARVODE.
 *
 * Two paths:
 *
 *   Taxa path  — when `useTaxa` is true: write the taxa amount to the
 *   ARVODE row, optionally keep TIDSSPILLAN as "överstigande 1 tim" if
 *   tidsspillan > 1, drop the unused rows.
 *
 *   Normal path — write hours × rate to each non-zero category row,
 *   sum to total, drop zero-amount rows. Per-row rounding policy
 *   (`roundingMode`) and rate override (`hourlyRateOverrideKr`) are
 *   user-configurable from the task pane.
 */
export interface ComputeArvodeInput {
  readonly read: ArvodeRead;
  readonly useTaxa: boolean;
  readonly hearingMinutes: number;
  readonly hours: CategoryHours;
  /**
   * "per-row" — round each row's amount to whole kr before summing.
   *             Total = sum of rounded rows. Court (taxemål)
   *             documents use this; the legacy VBA behavior. Default.
   * "sum-only" — keep per-row exact (potentially fractional kr); only
   *              the total is rounded to whole kr at the end.
   *
   * Optional in the input type so existing call sites that don't
   * care about the distinction get the legacy behavior automatically.
   */
  readonly roundingMode?: 'per-row' | 'sum-only';
  /**
   * Optional. Per-category rate override (kr/h) — when provided,
   * each category uses its own rate from this map instead of
   * parsing the doc's spec cell. Production passes resolved rates
   * from the task pane. Tests can omit to fall back to parseRateKr.
   */
  readonly categoryRatesKr?: {
    readonly arvode: number;
    readonly arvodeHelg: number;
    readonly tidsspillan: number;
    readonly tidsspillanOvrigTid: number;
  };
}

const HOURS_DECIMALS = 2;

export function computeArvode(input: ComputeArvodeInput): ArvodeState {
  return input.useTaxa ? computeTaxaPath(input) : computeNormalPath(input);
}

// ───────────────────────── Taxa path ──────────────────────────
//
// Taxa amounts come from a fixed-tier lookup (whole kr by spec); the
// rounding-mode and rate-override settings don't apply here.

function computeTaxaPath(input: ComputeArvodeInput): ArvodeState {
  const cells = input.read.cells;
  const patches: CellPatch[] = [];

  const taxaAmount = getTaxaAmount(input.hearingMinutes);
  patches.push({
    row: ARVODE_ROW.arvode,
    col: ARVODE_COL.spec,
    paragraphs: [`${formatHoursAndMinutes(input.hearingMinutes)} enligt taxa`],
  });
  patches.push({
    row: ARVODE_ROW.arvode,
    col: ARVODE_COL.amount,
    paragraphs: [formatSvMoney(taxaAmount)],
  });

  const utlaggAmount = readMoneyFromCell(cells, ARVODE_ROW.utlagg, ARVODE_COL.amount);
  let total = taxaAmount + utlaggAmount;

  // Tidsspillan > 1h becomes "överstigande 1 tim" billed as (h-1) × rate.
  let keepTidsspillan = false;
  const tidsspillanHours = roundToDecimals(input.hours.tidsspillan, HOURS_DECIMALS);
  if (tidsspillanHours > 1) {
    const remaining = roundToDecimals(tidsspillanHours - 1, HOURS_DECIMALS);
    const rate = resolveRate(input, ARVODE_ROW.tidsspillan);
    if (rate > 0 && remaining > 0) {
      const amount = roundToDecimals(remaining * rate, 0);
      patches.push({
        row: ARVODE_ROW.tidsspillan,
        col: ARVODE_COL.label,
        paragraphs: ['TIDSSPILLAN överstigande 1 tim'],
      });
      patches.push({
        row: ARVODE_ROW.tidsspillan,
        col: ARVODE_COL.spec,
        paragraphs: [formatRateSpec(remaining, rate)],
      });
      patches.push({
        row: ARVODE_ROW.tidsspillan,
        col: ARVODE_COL.amount,
        paragraphs: [formatSvMoney(amount)],
      });
      keepTidsspillan = true;
      total += amount;
    }
  }

  const rowsToDelete: number[] = [];
  if (isCellAmountZero(cells, ARVODE_ROW.utlagg, ARVODE_COL.amount)) {
    rowsToDelete.push(ARVODE_ROW.utlagg);
  }
  if (!keepTidsspillan) rowsToDelete.push(ARVODE_ROW.tidsspillan);
  rowsToDelete.push(ARVODE_ROW.tidsspillanOvrigTid, ARVODE_ROW.arvodeHelg);

  return {
    patches,
    rowsToDelete: dedupeAndSortDescending(rowsToDelete),
    totalExMomsKr: roundToDecimals(total, 2),
  };
}

// ──────────────────────── Normal path ─────────────────────────

function computeNormalPath(input: ComputeArvodeInput): ArvodeState {
  const cells = input.read.cells;
  const patches: CellPatch[] = [];
  // Default rounding mode = "per-row" (legacy / court behavior).
  const perRow = (input.roundingMode ?? 'per-row') === 'per-row';

  const renderedAmounts = new Map<number, number>();
  const apply = (rowIndex: number, hours: number): void => {
    const rounded = roundToDecimals(hours, HOURS_DECIMALS);
    if (rounded === 0) return;
    const rate = resolveRate(input, rowIndex);
    if (rate === 0) return;
    const exact = rounded * rate;
    const displayAmount = perRow ? roundToDecimals(exact, 0) : roundToDecimals(exact, 2);
    patches.push({
      row: rowIndex,
      col: ARVODE_COL.spec,
      paragraphs: [formatRateSpec(rounded, rate)],
    });
    patches.push({
      row: rowIndex,
      col: ARVODE_COL.amount,
      paragraphs: [formatSvMoney(displayAmount)],
    });
    renderedAmounts.set(rowIndex, displayAmount);
  };

  apply(ARVODE_ROW.arvode, input.hours.arvode);
  apply(ARVODE_ROW.arvodeHelg, input.hours.arvodeHelg);
  apply(ARVODE_ROW.tidsspillan, input.hours.tidsspillan);
  apply(ARVODE_ROW.tidsspillanOvrigTid, input.hours.tidsspillanOvrigTid);

  // Sum the amount column across all relevant rows. Rendered rows
  // contribute the value we just stored (rounded or exact depending on
  // mode); unrendered rows contribute whatever was already in the cell.
  let total = 0;
  for (const r of [
    ARVODE_ROW.arvode,
    ARVODE_ROW.arvodeHelg,
    ARVODE_ROW.tidsspillan,
    ARVODE_ROW.tidsspillanOvrigTid,
    ARVODE_ROW.utlagg,
  ]) {
    const rendered = renderedAmounts.get(r);
    if (rendered !== undefined) {
      total += rendered;
    } else {
      total += readMoneyFromCell(cells, r, ARVODE_COL.amount);
    }
  }
  // sum-only mode: round only the total, to whole kr.
  // per-row mode: total is already a sum of whole-kr amounts; rounding
  //               to 0 decimals is a no-op but keeps the schema-shape
  //               (a number with at most 2 decimals) consistent.
  const totalRounded = perRow ? roundToDecimals(total, 2) : roundToDecimals(total, 0);

  const rowsToDelete: number[] = [];
  for (const r of [
    ARVODE_ROW.utlagg,
    ARVODE_ROW.tidsspillanOvrigTid,
    ARVODE_ROW.tidsspillan,
    ARVODE_ROW.arvodeHelg,
    ARVODE_ROW.arvode,
  ]) {
    const rendered = renderedAmounts.get(r);
    const amount = rendered ?? readMoneyFromCell(cells, r, ARVODE_COL.amount);
    const text = cellText(cells, r, ARVODE_COL.amount);
    if (rendered === undefined && !hasAnyDigit(text)) {
      rowsToDelete.push(r);
    } else if (roundToDecimals(amount, 2) === 0) {
      rowsToDelete.push(r);
    }
  }

  return {
    patches,
    rowsToDelete: dedupeAndSortDescending(rowsToDelete),
    totalExMomsKr: totalRounded,
  };
}

// ────────────────────────── Helpers ───────────────────────────

function resolveRate(input: ComputeArvodeInput, rowIndex: number): number {
  // Production: rates come from the task pane (per-category map).
  // Tests / legacy: parse from the row's spec cell.
  if (input.categoryRatesKr !== undefined) {
    const r = input.categoryRatesKr;
    switch (rowIndex) {
      case ARVODE_ROW.arvode:
        return r.arvode;
      case ARVODE_ROW.arvodeHelg:
        return r.arvodeHelg;
      case ARVODE_ROW.tidsspillan:
        return r.tidsspillan;
      case ARVODE_ROW.tidsspillanOvrigTid:
        return r.tidsspillanOvrigTid;
      default:
      // fall through to parseRateKr for any other row (e.g. utlägg);
      // those don't bill by hour.
    }
  }
  return parseRateKr(cellText(input.read.cells, rowIndex, ARVODE_COL.spec));
}

function cellText(
  cells: readonly (readonly (readonly string[])[])[],
  row: number,
  col: number,
): string {
  return cells[row]?.[col]?.join('\r') ?? '';
}

function readMoneyFromCell(
  cells: readonly (readonly (readonly string[])[])[],
  row: number,
  col: number,
): number {
  return roundToDecimals(svToNumber(cellText(cells, row, col)), 2);
}

function isCellAmountZero(
  cells: readonly (readonly (readonly string[])[])[],
  row: number,
  col: number,
): boolean {
  const text = cellText(cells, row, col);
  if (!hasAnyDigit(text)) return true;
  return readMoneyFromCell(cells, row, col) === 0;
}

function dedupeAndSortDescending(rows: readonly number[]): number[] {
  return [...new Set(rows)].sort((a, b) => b - a);
}
