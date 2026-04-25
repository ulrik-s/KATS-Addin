import { type KatsContext } from '../../core/context.js';
import { type Processor, type TagName, requireTableRange, tagName } from '../../core/processor.js';
import { type KatsRange, type TableKatsRange } from '../../io/kats-range.js';
import {
  requireArgrupperRead,
  requireArgrupperState,
  setArgrupperRead,
  setArgrupperState,
} from './state.js';
import { computeArgrupper } from './transform.js';

const ARGRUPPER_TAG: TagName = tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA');

export interface ArgrupperDependencies {
  /** Tests pin "now" for deterministic hearing-minutes output. */
  readonly now: () => Date;
}

/**
 * Renders the time-grouped table at
 * `[[KATS_ARGRUPPERTIDERDATUMANTALSUMMA]]`.
 *
 * Phases:
 *   read      — capture full table snapshot.
 *   transform — pure: detect taxemål + hearing time, sum hours per
 *               category, build cell patches.
 *   render    — apply patches via setCellParagraphs.
 *
 * Sets cross-processor state (hours, isTaxemal, hearingMinutes) on
 * KatsContext so ARVODE can pick it up in its own transform phase.
 */
export class ArgrupperTiderProcessor implements Processor {
  readonly tag = ARGRUPPER_TAG;
  readonly requiresRangeKind = 'table' as const;

  constructor(private readonly deps: ArgrupperDependencies) {}

  async read(range: KatsRange, ctx: KatsContext): Promise<void> {
    const table = requireTableRange(range, this.tag, 'read');
    const cells = await snapshotTable(table);
    setArgrupperRead(ctx, { cells });
  }

  transform(ctx: KatsContext): void {
    const read = requireArgrupperRead(ctx);
    const state = computeArgrupper({ read, now: this.deps.now() });
    setArgrupperState(ctx, state);
  }

  async render(range: KatsRange, ctx: KatsContext): Promise<void> {
    const table = requireTableRange(range, this.tag, 'render');
    const state = requireArgrupperState(ctx);
    for (const patch of state.patches) {
      await table.setCellParagraphs(patch.row, patch.col, patch.paragraphs);
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
