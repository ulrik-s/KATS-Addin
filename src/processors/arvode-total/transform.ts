import { formatSvMoney, roundToDecimals } from '../../domain/money.js';
import {
  ARVODE_TOTAL_AMOUNT_COL,
  VAT_RATE,
  type ArvodeTotalRead,
  type ArvodeTotalState,
  type CellPatch,
} from './schema.js';

/**
 * Pure transform for ARVODE_TOTAL.
 *
 * Reads the resolved arvode-ex-moms and utlagg-ej-moms totals from
 * upstream processors (passed in as input here for testability), then:
 *   - moms      = round(arvodeExMoms × 0.25, 0)
 *   - utlaggEj  = round(utlaggEjMoms, 0)        // (or 0 if absent)
 *   - inkl      = round(arvodeEx + moms + utlaggEj, 0)
 *
 * Writes one cell patch per discovered label row. If the
 * `utlaggEjMoms` row is found but the value rounds to 0, that row is
 * scheduled for deletion (mirrors VBA's `DeleteArvodeRowIfZeroAmount`
 * call after rendering).
 */
export interface ComputeArvodeTotalInput {
  readonly read: ArvodeTotalRead;
  readonly arvodeExMomsKr: number;
  /** undefined when UTLAGG did not run. Treated as 0. */
  readonly utlaggEjMomsKr: number | undefined;
}

export function computeArvodeTotal(input: ComputeArvodeTotalInput): ArvodeTotalState {
  const arvodeExMoms = roundToDecimals(input.arvodeExMomsKr, 0);
  const moms = roundToDecimals(arvodeExMoms * VAT_RATE, 0);
  const utlaggEj =
    input.utlaggEjMomsKr === undefined ? 0 : roundToDecimals(input.utlaggEjMomsKr, 0);
  const inkl = roundToDecimals(arvodeExMoms + moms + utlaggEj, 0);

  const patches: CellPatch[] = [];
  if (input.read.rowExMoms >= 0) {
    patches.push({
      row: input.read.rowExMoms,
      col: ARVODE_TOTAL_AMOUNT_COL,
      paragraphs: [formatSvMoney(arvodeExMoms)],
    });
  }
  if (input.read.rowMoms >= 0) {
    patches.push({
      row: input.read.rowMoms,
      col: ARVODE_TOTAL_AMOUNT_COL,
      paragraphs: [formatSvMoney(moms)],
    });
  }
  if (input.read.rowUtlaggEjMoms >= 0) {
    patches.push({
      row: input.read.rowUtlaggEjMoms,
      col: ARVODE_TOTAL_AMOUNT_COL,
      paragraphs: [formatSvMoney(utlaggEj)],
    });
  }
  if (input.read.rowInkl >= 0) {
    patches.push({
      row: input.read.rowInkl,
      col: ARVODE_TOTAL_AMOUNT_COL,
      paragraphs: [formatSvMoney(inkl)],
    });
  }

  const rowsToDelete: number[] = [];
  if (input.read.rowUtlaggEjMoms >= 0 && utlaggEj === 0) {
    rowsToDelete.push(input.read.rowUtlaggEjMoms);
  }

  return {
    patches,
    rowsToDelete: [...new Set(rowsToDelete)].sort((a, b) => b - a),
    arvodeExMomsKr: arvodeExMoms,
    momsKr: moms,
    utlaggEjMomsKr: utlaggEj,
    inklKr: inkl,
  };
}
