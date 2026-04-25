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
 *   sum to total, drop zero-amount rows.
 */
export interface ComputeArvodeInput {
  readonly read: ArvodeRead;
  readonly useTaxa: boolean;
  readonly hearingMinutes: number;
  readonly hours: CategoryHours;
}

const HOURS_DECIMALS = 2;

export function computeArvode(input: ComputeArvodeInput): ArvodeState {
  return input.useTaxa ? computeTaxaPath(input) : computeNormalPath(input);
}

// ───────────────────────── Taxa path ──────────────────────────

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
    const rate = parseRateKr(cellText(cells, ARVODE_ROW.tidsspillan, ARVODE_COL.spec));
    if (rate > 0 && remaining > 0) {
      const amount = roundToDecimals(remaining * rate, 0);
      patches.push({
        row: ARVODE_ROW.tidsspillan,
        col: ARVODE_COL.label,
        paragraphs: ['TIDSSPILLAN \u00f6verstigande 1 tim'],
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

  // Determine rows to drop. Always: arvodeHelg, tidsspillanOvrigTid.
  // Tidsspillan only if not kept. Utlagg only if its amount cell is empty/0.
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

  const renderedAmounts = new Map<number, number>();
  const apply = (rowIndex: number, hours: number): void => {
    const rounded = roundToDecimals(hours, HOURS_DECIMALS);
    if (rounded === 0) return;
    const rate = parseRateKr(cellText(cells, rowIndex, ARVODE_COL.spec));
    if (rate === 0) return;
    const amount = roundToDecimals(rounded * rate, 0);
    patches.push({
      row: rowIndex,
      col: ARVODE_COL.spec,
      paragraphs: [formatRateSpec(rounded, rate)],
    });
    patches.push({
      row: rowIndex,
      col: ARVODE_COL.amount,
      paragraphs: [formatSvMoney(amount)],
    });
    renderedAmounts.set(rowIndex, amount);
  };

  apply(ARVODE_ROW.arvode, input.hours.arvode);
  apply(ARVODE_ROW.arvodeHelg, input.hours.arvodeHelg);
  apply(ARVODE_ROW.tidsspillan, input.hours.tidsspillan);
  apply(ARVODE_ROW.tidsspillanOvrigTid, input.hours.tidsspillanOvrigTid);

  // Total is the sum of all amount cells in rows 1–5 (any row that has
  // a digit in col 2). Includes UTLAGG as-is and any rendered category.
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

  // Drop any row whose amount cell is empty / zero (in the rendered view).
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
    totalExMomsKr: roundToDecimals(total, 2),
  };
}

// ────────────────────────── Helpers ───────────────────────────

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
