import { describe, it, expect } from 'vitest';
import { KatsContext } from '../../../src/core/context.js';
import { tagName } from '../../../src/core/processor.js';
import { type Discovery, MapProcessorRegistry, runPipeline } from '../../../src/core/pipeline.js';
import { type CategoryHours } from '../../../src/processors/argrupper-tider/schema.js';
import { setArgrupperState } from '../../../src/processors/argrupper-tider/state.js';
import { FakeTableKatsRange } from '../../../src/io/fake-kats-table.js';
import {
  ArvodeProcessor,
  computeArvode,
  getArvodeExMomsFromContext,
  type ArvodeRead,
} from '../../../src/processors/arvode/index.js';

/** 6×3 table with: header / Arvode / Arvode helg / Tidsspillan / Tids övrig / Utlägg. */
function arvodeTable(rows: readonly (readonly [string, string, string])[]): FakeTableKatsRange {
  return new FakeTableKatsRange(
    rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
  );
}

const HEADER_ROW = ['', '', ''] as const;

const STD_TABLE: readonly (readonly [string, string, string])[] = [
  HEADER_ROW,
  ['Arvode', '0,00 á 850 kr', ''],
  ['Arvode helg', '0,00 á 1 250 kr', ''],
  ['Tidsspillan', '0,00 á 850 kr', ''],
  ['Tidsspillan övrig tid', '0,00 á 425 kr', ''],
  ['Utlägg', '', '550 kr'],
];

function makeRead(rows: readonly (readonly [string, string, string])[]): ArvodeRead {
  return {
    cells: rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
  };
}

const ZERO_HOURS: CategoryHours = {
  arvode: 0,
  arvodeHelg: 0,
  tidsspillan: 0,
  tidsspillanOvrigTid: 0,
};

describe('computeArvode — normal path', () => {
  it('writes hour × rate amounts to non-zero rows', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 2 },
    });
    const arvodeAmt = state.patches.find((p) => p.row === 1 && p.col === 2);
    expect(arvodeAmt?.paragraphs).toEqual(['1 700,00 kr']);
  });

  it('writes the rate spec back ("H,MM á RRR kr")', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 1.5 },
    });
    const arvodeSpec = state.patches.find((p) => p.row === 1 && p.col === 1);
    expect(arvodeSpec?.paragraphs).toEqual(['1,50 \u00e1 850 kr']);
  });

  it('skips rows with zero hours and no rate output', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 1 },
    });
    expect(state.patches.find((p) => p.row === 2 && p.col === 1)).toBeUndefined();
    expect(state.patches.find((p) => p.row === 3 && p.col === 1)).toBeUndefined();
  });

  it('totals rendered amounts plus existing utlägg', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 2, tidsspillan: 1 },
    });
    // 2 × 850 = 1700, 1 × 850 = 850, utlägg = 550 → 3100
    expect(state.totalExMomsKr).toBe(3100);
  });

  it('marks zero-amount rows for deletion (descending order)', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 2 },
    });
    // arvodeHelg(2), tidsspillan(3), tidsspillanOvrigTid(4) → all zero
    // utlägg(5) has 550 kr → kept
    expect(state.rowsToDelete).toEqual([4, 3, 2]);
  });

  it('keeps utlägg row when it has an amount', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 1 },
    });
    expect(state.rowsToDelete).not.toContain(5);
  });

  it('drops utlägg row when its cell is empty', () => {
    const noUtlagg = STD_TABLE.map((row, i) => (i === 5 ? (['Utlägg', '', ''] as const) : row));
    const state = computeArvode({
      read: makeRead(noUtlagg),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 1 },
    });
    expect(state.rowsToDelete).toContain(5);
  });
});

describe('computeArvode — taxa path', () => {
  it('writes "H tim M min enligt taxa" + taxa amount', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: true,
      hearingMinutes: 75, // tier 75-89: 5106 kr
      hours: ZERO_HOURS,
    });
    const spec = state.patches.find((p) => p.row === 1 && p.col === 1);
    const amt = state.patches.find((p) => p.row === 1 && p.col === 2);
    expect(spec?.paragraphs).toEqual(['1 tim 15 min enligt taxa']);
    expect(amt?.paragraphs).toEqual(['5 106,00 kr']);
  });

  it('total = taxaAmount + utlägg amount', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: true,
      hearingMinutes: 75,
      hours: ZERO_HOURS,
    });
    expect(state.totalExMomsKr).toBe(5106 + 550);
  });

  it('drops Arvode helg, Tidsspillan, Tids övrig (and Utlägg if empty)', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: true,
      hearingMinutes: 60,
      hours: ZERO_HOURS,
    });
    // Arvode kept, Utlägg kept (550), others dropped.
    expect(state.rowsToDelete).toContain(2);
    expect(state.rowsToDelete).toContain(3);
    expect(state.rowsToDelete).toContain(4);
    expect(state.rowsToDelete).not.toContain(1);
    expect(state.rowsToDelete).not.toContain(5);
    // Descending order.
    expect([...state.rowsToDelete]).toEqual([...state.rowsToDelete].sort((a, b) => b - a));
  });

  it('keeps Tidsspillan as "överstigande 1 tim" when tidsspillan > 1h', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: true,
      hearingMinutes: 60, // taxa = 4583
      hours: { ...ZERO_HOURS, tidsspillan: 2.5 }, // 1.5 remaining @ 850 = 1275
    });
    const label = state.patches.find((p) => p.row === 3 && p.col === 0);
    const spec = state.patches.find((p) => p.row === 3 && p.col === 1);
    const amt = state.patches.find((p) => p.row === 3 && p.col === 2);
    expect(label?.paragraphs).toEqual(['TIDSSPILLAN \u00f6verstigande 1 tim']);
    expect(spec?.paragraphs).toEqual(['1,50 \u00e1 850 kr']);
    expect(amt?.paragraphs).toEqual(['1 275,00 kr']);
    expect(state.rowsToDelete).not.toContain(3);
    expect(state.totalExMomsKr).toBe(4583 + 1275 + 550);
  });

  it('drops Tidsspillan when ≤ 1h even on taxa path', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: true,
      hearingMinutes: 60,
      hours: { ...ZERO_HOURS, tidsspillan: 1 },
    });
    expect(state.rowsToDelete).toContain(3);
  });
});

describe('ArvodeProcessor — pipeline integration', () => {
  it('runs end-to-end with ARGRUPPER state in ctx', async () => {
    const registry = new MapProcessorRegistry();
    registry.register(new ArvodeProcessor());

    const ctx = new KatsContext();
    setArgrupperState(ctx, {
      hours: { ...ZERO_HOURS, arvode: 2 },
      isTaxemal: false,
      patches: [],
    });

    const range = arvodeTable(STD_TABLE);
    const discoveries: Discovery[] = [{ tag: tagName('KATS_ARVODE'), range }];
    await runPipeline(discoveries, registry, ctx);

    expect(getArvodeExMomsFromContext(ctx)).toBe(2 * 850 + 550);
    const snap = range.snapshot();
    // Header + Arvode + Utlägg should remain (4 rows deleted: indices 4, 3, 2).
    expect(snap.length).toBe(STD_TABLE.length - 3);
  });

  it('runs taxa path when ARGRUPPER says shouldUseTaxa', async () => {
    const registry = new MapProcessorRegistry();
    registry.register(new ArvodeProcessor());

    const ctx = new KatsContext();
    setArgrupperState(ctx, {
      hours: ZERO_HOURS,
      isTaxemal: true,
      hearingStart: new Date(2026, 3, 25, 9, 0),
      hearingMinutes: 75,
      patches: [],
    });

    const range = arvodeTable(STD_TABLE);
    const discoveries: Discovery[] = [{ tag: tagName('KATS_ARVODE'), range }];
    await runPipeline(discoveries, registry, ctx);

    expect(getArvodeExMomsFromContext(ctx)).toBe(5106 + 550);
    const snap = range.snapshot();
    // Header + Arvode + Utlägg = 3 rows. Three rows deleted.
    expect(snap.length).toBe(3);
    expect(snap[1]?.[2]).toEqual(['5 106,00 kr']);
  });
});
