import { type KatsContext } from '../../core/context.js';
import { type Processor, type TagName, requireTableRange, tagName } from '../../core/processor.js';
import { swedishLooseContains } from '../../domain/swedish-text.js';
import { type KatsRange, type TableKatsRange } from '../../io/kats-range.js';
import { getArvodeExMomsFromContext } from '../arvode/state.js';
import { getUtlaggTotalsFromContext } from '../utlagg/state.js';
import { ARVODE_TOTAL_LABELS } from './schema.js';
import {
  requireArvodeTotalRead,
  requireArvodeTotalState,
  setArvodeTotalRead,
  setArvodeTotalState,
} from './state.js';
import { computeArvodeTotal } from './transform.js';

const ARVODE_TOTAL_TAG: TagName = tagName('KATS_ARVODE_TOTAL');

/**
 * Renders the invoice summary at `[[KATS_ARVODE_TOTAL]]`.
 *
 * Cross-processor inputs:
 *   - arvodeExMomsKr   (from ARVODE)
 *   - utlaggEjMomsKr   (from UTLAGG)
 *
 * Computes moms (25%) + total inkl moms and writes them to the rows
 * found by label match in col 0.
 */
export class ArvodeTotalProcessor implements Processor {
  readonly tag = ARVODE_TOTAL_TAG;
  readonly requiresRangeKind = 'table' as const;

  async read(range: KatsRange, ctx: KatsContext): Promise<void> {
    const table = requireTableRange(range, this.tag, 'read');
    const cells = await snapshotTable(table);

    const rowExMoms = findRowByLabel(cells, ARVODE_TOTAL_LABELS.exMoms);
    const rowMoms = findRowByLabel(cells, ARVODE_TOTAL_LABELS.moms);
    const rowUtlaggEjMoms = findRowByLabel(cells, ARVODE_TOTAL_LABELS.utlaggEjMoms);
    const rowInkl = findRowByLabel(cells, ARVODE_TOTAL_LABELS.inkl);

    setArvodeTotalRead(ctx, {
      cells,
      rowExMoms,
      rowMoms,
      rowUtlaggEjMoms,
      rowInkl,
    });
  }

  transform(ctx: KatsContext): void {
    const read = requireArvodeTotalRead(ctx);
    const arvodeExMomsKr = getArvodeExMomsFromContext(ctx) ?? 0;
    const utlaggTotals = getUtlaggTotalsFromContext(ctx);
    setArvodeTotalState(
      ctx,
      computeArvodeTotal({
        read,
        arvodeExMomsKr,
        utlaggEjMomsKr: utlaggTotals?.ejMomsKr,
      }),
    );
  }

  async render(range: KatsRange, ctx: KatsContext): Promise<void> {
    const table = requireTableRange(range, this.tag, 'render');
    const state = requireArvodeTotalState(ctx);
    for (const patch of state.patches) {
      await table.setCellParagraphs(patch.row, patch.col, patch.paragraphs);
    }
    for (const row of state.rowsToDelete) {
      await table.deleteRow(row);
    }
  }
}

async function snapshotTable(
  table: TableKatsRange,
): Promise<readonly (readonly (readonly string[])[])[]> {
  const rows: string[][][] = [];
  for (let r = 0; r < table.rowCount; r += 1) {
    const row: string[][] = [];
    for (let c = 0; c < table.columnCount; c += 1) {
      const text = await table.getCellText(r, c);
      row.push(text.length === 0 ? [] : text.split('\r'));
    }
    rows.push(row);
  }
  return rows;
}

function findRowByLabel(cells: readonly (readonly (readonly string[])[])[], label: string): number {
  for (let r = 0; r < cells.length; r += 1) {
    const text = cells[r]?.[0]?.join('\r') ?? '';
    if (swedishLooseContains(text, label)) return r;
  }
  return -1;
}
