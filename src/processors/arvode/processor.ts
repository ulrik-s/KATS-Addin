import { type KatsContext } from '../../core/context.js';
import { ProcessorError } from '../../core/errors.js';
import { type Processor, type TagName, requireTableRange, tagName } from '../../core/processor.js';
import { type KatsRange, type TableKatsRange } from '../../io/kats-range.js';
import {
  getCategoryHoursFromContext,
  getHearingMinutesFromContext,
  shouldUseTaxaFromContext,
} from '../argrupper-tider/state.js';
import { ARVODE_ROW } from './schema.js';
import { requireArvodeRead, requireArvodeState, setArvodeRead, setArvodeState } from './state.js';
import { computeArvode } from './transform.js';

const ARVODE_TAG: TagName = tagName('KATS_ARVODE');

const REQUIRED_ROWS = ARVODE_ROW.utlagg + 1;
const REQUIRED_COLS = 3;

export interface ArvodeDependencies {
  /**
   * Per-row (default, court-style) vs sum-only (round only the
   * total, keep per-row exact). User-controlled from the task pane.
   */
  readonly getRoundingMode: () => 'per-row' | 'sum-only';
  /** Optional hourly-rate override that wins over the doc's spec cell. */
  readonly getHourlyRateOverrideKr: () => number | undefined;
}

/**
 * Renders the ARVODE summary table at `[[KATS_ARVODE]]`.
 *
 * Cross-processor inputs (read from ctx in transform):
 *   - shouldUseTaxa flag           (from ARGRUPPER)
 *   - hearingMinutes               (from ARGRUPPER)
 *   - hours per category           (from ARGRUPPER)
 *
 * Settings inputs (resolved at transform time):
 *   - rounding mode + hourly-rate override (from task pane)
 *
 * Sets `arvode.totalExMomsKr` for ARVODE_TOTAL to consume.
 */
export class ArvodeProcessor implements Processor {
  readonly tag = ARVODE_TAG;

  constructor(private readonly deps: ArvodeDependencies = DEFAULT_DEPS) {}

  async read(range: KatsRange, ctx: KatsContext): Promise<void> {
    const table = requireTableRange(range, this.tag, 'read');
    if (table.rowCount < REQUIRED_ROWS) {
      throw new ProcessorError(
        `expected ≥${String(REQUIRED_ROWS)} rows, got ${String(table.rowCount)}`,
        this.tag,
        'read',
      );
    }
    if (table.columnCount < REQUIRED_COLS) {
      throw new ProcessorError(
        `expected ≥${String(REQUIRED_COLS)} cols, got ${String(table.columnCount)}`,
        this.tag,
        'read',
      );
    }
    const cells = await snapshotTable(table);
    setArvodeRead(ctx, { cells });
  }

  transform(ctx: KatsContext): void {
    const read = requireArvodeRead(ctx);
    const useTaxa = shouldUseTaxaFromContext(ctx);
    const hearingMinutes = getHearingMinutesFromContext(ctx) ?? 0;
    const hours = getCategoryHoursFromContext(ctx) ?? {
      arvode: 0,
      arvodeHelg: 0,
      tidsspillan: 0,
      tidsspillanOvrigTid: 0,
    };
    const roundingMode = this.deps.getRoundingMode();
    const override = this.deps.getHourlyRateOverrideKr();
    setArvodeState(
      ctx,
      computeArvode({
        read,
        useTaxa,
        hearingMinutes,
        hours,
        roundingMode,
        ...(override !== undefined ? { hourlyRateOverrideKr: override } : {}),
      }),
    );
  }

  async render(range: KatsRange, ctx: KatsContext): Promise<void> {
    const table = requireTableRange(range, this.tag, 'render');
    const state = requireArvodeState(ctx);
    for (const patch of state.patches) {
      await table.setCellParagraphs(patch.row, patch.col, patch.paragraphs);
    }
    // rowsToDelete is already sorted descending so indices stay valid.
    for (const row of state.rowsToDelete) {
      await table.deleteRow(row);
    }
  }
}

/** Backwards-compatible default: legacy court-mode behavior. */
const DEFAULT_DEPS: ArvodeDependencies = {
  getRoundingMode: () => 'per-row',
  getHourlyRateOverrideKr: () => undefined,
};

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
