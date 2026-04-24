import { type KatsContext } from '../../core/context.js';
import { ProcessorError } from '../../core/errors.js';
import { type Processor, type TagName, requireTableRange, tagName } from '../../core/processor.js';
import { parseAddressBlock } from '../../domain/address.js';
import { nfc } from '../../domain/swedish-text.js';
import { type KatsRange } from '../../io/kats-range.js';
import { requireMottagareState, setMottagareState } from './state.js';

const MOTTAGARE_TAG: TagName = tagName('KATS_MOTTAGARE');

/** Which cell in the 1×N table holds the recipient address block. VBA: cell[0][1]. */
const ADDRESS_CELL_ROW = 0;
const ADDRESS_CELL_COL = 1;

/**
 * Renders the recipient header at `[[KATS_MOTTAGARE]]`.
 *
 * Phases:
 *   read      — fetch the address-block cell; parse into firstLine + postort;
 *               store in ctx for SIGNATUR to consume downstream.
 *   transform — no-op; parsing happened at read time and downstream
 *               processors (SIGNATUR) access postort through ctx during
 *               their own transform.
 *   render    — replace the same cell with `firstLine` + "via e-post".
 */
export class MottagareProcessor implements Processor {
  readonly tag = MOTTAGARE_TAG;

  async read(range: KatsRange, ctx: KatsContext): Promise<void> {
    const table = requireTableRange(range, this.tag, 'read');
    if (table.columnCount < 2) {
      throw new ProcessorError(
        `expected table with ≥2 columns, got ${String(table.columnCount)}`,
        this.tag,
        'read',
      );
    }
    if (table.rowCount < 1) {
      throw new ProcessorError(
        `expected table with ≥1 row, got ${String(table.rowCount)}`,
        this.tag,
        'read',
      );
    }
    const raw = await table.getCellText(ADDRESS_CELL_ROW, ADDRESS_CELL_COL);
    const { firstLine, postort } = parseAddressBlock(raw);
    if (firstLine.length === 0) {
      throw new ProcessorError('recipient block is empty', this.tag, 'read');
    }
    setMottagareState(ctx, { firstLine: nfc(firstLine), postort: nfc(postort) });
  }

  transform(_ctx: KatsContext): void {
    // All parsing happened in read(); this hook exists to satisfy the
    // Processor contract. Downstream processors (SIGNATUR) read postort
    // from ctx in their own transform phase.
  }

  async render(range: KatsRange, ctx: KatsContext): Promise<void> {
    const table = requireTableRange(range, this.tag, 'render');
    const state = requireMottagareState(ctx);
    await table.setCellParagraphs(ADDRESS_CELL_ROW, ADDRESS_CELL_COL, [
      state.firstLine,
      'via e-post',
    ]);
  }
}
