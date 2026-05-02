import { looksLikeIsoDate } from '../../domain/iso-date.js';
import {
  formatSvDecimal,
  formatSvInt,
  roundHalfAwayFromZero,
  svToNumber,
} from '../../domain/money.js';
import {
  type LabelSpec,
  labelPrimary,
  swedishLooseContains,
  swedishLooseEqualsAny,
} from '../../domain/swedish-text.js';
import {
  UTLAGG_COL,
  UTLAGG_SECTION_NO_VAT,
  UTLAGG_SECTION_VAT,
  UTLAGG_SUMMARY_LABEL,
  type CellPatch,
  type UtlaggRead,
  type UtlaggState,
} from './schema.js';

/**
 * Pure transform for UTLAGG. Given the read-time table snapshot and the
 * mileage rate (from the resolved user), produces the cell patches and
 * section totals that the render phase applies.
 *
 * Mirrors VBA `ProcessExpenseSection` for both sections. The VBA-era
 * "summa" row clearing and per-row amount recalculation live here as
 * pure logic on the snapshot — render just writes.
 *
 * Heading and summary labels are matched via `swedishLooseEqualsAny`,
 * so English/translated drafts are accepted. When even the tolerant
 * matcher comes up empty, a warning is pushed to `state.warnings`.
 */
export interface ComputeUtlaggInput {
  readonly read: UtlaggRead;
  /** kr/km mileage rate from the resolved user. */
  readonly mileageKrPerKm: number;
}

export function computeUtlagg(input: ComputeUtlaggInput): UtlaggState {
  const cells = input.read.cells;
  const patches: CellPatch[] = [];
  const warnings: string[] = [];

  const vat = processSection({
    cells,
    section: UTLAGG_SECTION_VAT,
    applyMileage: true,
    mileageKrPerKm: input.mileageKrPerKm,
    patches,
    warnings,
  });
  const noVat = processSection({
    cells,
    section: UTLAGG_SECTION_NO_VAT,
    applyMileage: false,
    mileageKrPerKm: input.mileageKrPerKm,
    patches,
    warnings,
  });

  // Sanity check: data rows present but no section recognized at all.
  if (
    vat === 0 &&
    noVat === 0 &&
    findHeadingRow(cells, UTLAGG_SECTION_VAT) < 0 &&
    findHeadingRow(cells, UTLAGG_SECTION_NO_VAT) < 0 &&
    hasDataRows(cells)
  ) {
    warnings.push(
      'UTLÄGG-tabellen ser ut att innehålla data men ingen sektionsrubrik hittades — ' +
        `kontrollera att rubriken heter "${labelPrimary(UTLAGG_SECTION_VAT)}".`,
    );
  }

  return {
    patches,
    totalExMomsKr: vat,
    totalEjMomsKr: noVat,
    warnings,
  };
}

interface ProcessSectionArgs {
  readonly cells: readonly (readonly (readonly string[])[])[];
  readonly section: LabelSpec;
  readonly applyMileage: boolean;
  readonly mileageKrPerKm: number;
  readonly patches: CellPatch[];
  readonly warnings: string[];
}

/** Returns the section's total in kronor (rounded to whole kr). */
function processSection(args: ProcessSectionArgs): number {
  const headingRow = findHeadingRow(args.cells, args.section);
  if (headingRow < 0) return 0;
  const summaryRow = findSummaryRowAfter(args.cells, headingRow);
  if (summaryRow < 0) {
    args.warnings.push(
      `UTLÄGG: rubriken "${labelPrimary(args.section)}" hittades men summaraden ` +
        `("${labelPrimary(UTLAGG_SUMMARY_LABEL)}") saknas — sektionen ignorerades.`,
    );
    return 0;
  }

  let totalKr = 0;
  for (let r = headingRow + 1; r < summaryRow; r += 1) {
    const dateText = cellText(args.cells, r, UTLAGG_COL.date);
    if (!looksLikeIsoDate(dateText)) continue;

    const description = cellText(args.cells, r, UTLAGG_COL.description);
    let rate = svToNumber(cellText(args.cells, r, UTLAGG_COL.rate));
    const qty = svToNumber(cellText(args.cells, r, UTLAGG_COL.quantity));
    const existingAmount = svToNumber(cellText(args.cells, r, UTLAGG_COL.amount));

    if (args.applyMileage && swedishLooseContains(description, 'Milersättning')) {
      rate = args.mileageKrPerKm;
      args.patches.push({
        row: r,
        col: UTLAGG_COL.rate,
        paragraphs: [formatSvDecimal(rate, 2)],
      });
    }

    const computed =
      qty !== 0 && rate !== 0
        ? roundHalfAwayFromZero(qty * rate)
        : roundHalfAwayFromZero(existingAmount);

    args.patches.push({
      row: r,
      col: UTLAGG_COL.amount,
      paragraphs: [formatSvInt(computed)],
    });
    totalKr += computed;
  }

  // Clear quantity, write total to amount on the "Summa" row.
  args.patches.push({
    row: summaryRow,
    col: UTLAGG_COL.quantity,
    paragraphs: [],
  });
  args.patches.push({
    row: summaryRow,
    col: UTLAGG_COL.amount,
    paragraphs: [formatSvInt(roundHalfAwayFromZero(totalKr))],
  });

  return roundHalfAwayFromZero(totalKr);
}

function cellText(
  cells: readonly (readonly (readonly string[])[])[],
  row: number,
  col: number,
): string {
  return cells[row]?.[col]?.join('\r') ?? '';
}

/**
 * Find the row whose first non-empty cell loose-equals any variant of
 * `section` and where every other non-empty cell on the row matches the
 * same. VBA parity: a heading is a row with exactly one piece of
 * meaningful content.
 */
function findHeadingRow(
  cells: readonly (readonly (readonly string[])[])[],
  section: LabelSpec,
): number {
  for (let r = 0; r < cells.length; r += 1) {
    const row = cells[r];
    if (!row) continue;
    const nonEmptyTexts = row.map((cell) => cell.join('\r').trim()).filter((t) => t.length > 0);
    if (nonEmptyTexts.length === 0) continue;
    const allMatch = nonEmptyTexts.every((t) => swedishLooseEqualsAny(t, section));
    if (allMatch) return r;
  }
  return -1;
}

/** Find the first row after `headingRow` where col 0 (trimmed) matches the summary spec. */
function findSummaryRowAfter(
  cells: readonly (readonly (readonly string[])[])[],
  headingRow: number,
): number {
  for (let r = headingRow + 1; r < cells.length; r += 1) {
    const text = cellText(cells, r, 0).trim();
    if (swedishLooseEqualsAny(text, UTLAGG_SUMMARY_LABEL)) return r;
  }
  return -1;
}

function hasDataRows(cells: readonly (readonly (readonly string[])[])[]): boolean {
  for (let r = 0; r < cells.length; r += 1) {
    if (looksLikeIsoDate(cellText(cells, r, UTLAGG_COL.date))) return true;
  }
  return false;
}
