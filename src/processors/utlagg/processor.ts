import { type KatsContext } from '../../core/context.js';
import { ProcessorError } from '../../core/errors.js';
import { type Processor, type TagName, requireTableRange, tagName } from '../../core/processor.js';
import { type KatsUser } from '../../domain/user-db.js';
import { type KatsRange } from '../../io/kats-range.js';
import { computeUtlagg } from './transform.js';
import { requireUtlaggRead, requireUtlaggState, setUtlaggRead, setUtlaggState } from './state.js';
import { UTLAGG_COL } from './schema.js';

const UTLAGG_TAG: TagName = tagName('KATS_UTLAGGSSPECIFIKATION');

const REQUIRED_COLUMNS = 5;

export interface UtlaggDependencies {
  /** Resolved current user — needed for `mileageKrPerKm` in the mileage rule. */
  readonly getCurrentUser: () => KatsUser;
}

/**
 * Renders the expense specification at `[[KATS_UTLAGGSSPECIFIKATION]]`.
 *
 * Expects a 5-column table with two sections: "Utlägg" (with VAT) and
 * "Utlägg momsfri" (VAT-free). Each section has a heading row, data
 * rows (col 0 = ISO date), and a "Summa" row.
 *
 * Phases:
 *   read      — capture the entire table snapshot.
 *   transform — pure: detect mileage rows, compute per-row amounts,
 *               sum each section, build cell patches. Writes section
 *               totals to ctx so ARVODE_TOTAL can read them.
 *   render    — apply patches via setCellParagraphs.
 */
export class UtlaggProcessor implements Processor {
  readonly tag = UTLAGG_TAG;

  constructor(private readonly deps: UtlaggDependencies) {}

  async read(range: KatsRange, ctx: KatsContext): Promise<void> {
    const table = requireTableRange(range, this.tag, 'read');
    if (table.columnCount < REQUIRED_COLUMNS) {
      throw new ProcessorError(
        `expected ≥${String(REQUIRED_COLUMNS)} columns, got ${String(table.columnCount)}`,
        this.tag,
        'read',
      );
    }
    const cells = await snapshotTable(table);
    setUtlaggRead(ctx, { cells });
  }

  transform(ctx: KatsContext): void {
    const read = requireUtlaggRead(ctx);
    const user = this.deps.getCurrentUser();
    const state = computeUtlagg({ read, mileageKrPerKm: user.mileageKrPerKm });
    setUtlaggState(ctx, state);
  }

  async render(range: KatsRange, ctx: KatsContext): Promise<void> {
    const table = requireTableRange(range, this.tag, 'render');
    const state = requireUtlaggState(ctx);
    for (const patch of state.patches) {
      await table.setCellParagraphs(patch.row, patch.col, patch.paragraphs);
    }
  }
}

async function snapshotTable(table: {
  rowCount: number;
  columnCount: number;
  getCellText: (r: number, c: number) => Promise<string>;
}): Promise<readonly (readonly (readonly string[])[])[]> {
  const rows: string[][][] = [];
  for (let r = 0; r < table.rowCount; r += 1) {
    const row: string[][] = [];
    for (let c = 0; c < table.columnCount; c += 1) {
      const text = await table.getCellText(r, c);
      // Split on Word's paragraph separator. An empty cell becomes [].
      row.push(text.length === 0 ? [] : text.split('\r'));
    }
    rows.push(row);
  }
  return rows;
}

export { UTLAGG_COL };
