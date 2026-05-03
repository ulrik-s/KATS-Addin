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

describe('computeArvode — rounding modes', () => {
  // Doc rate is 850 kr/hr in STD_TABLE.
  // 1.55 hours × 850 kr = 1317.50 kr — fractional kr to make the
  // mode difference observable.
  const FRACTIONAL_HOURS: CategoryHours = { ...ZERO_HOURS, arvode: 1.55 };

  it('per-row mode rounds each row to whole kr (default behavior)', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: FRACTIONAL_HOURS,
      roundingMode: 'per-row',
    });
    const arvodeAmt = state.patches.find((p) => p.row === 1 && p.col === 2);
    expect(arvodeAmt?.paragraphs).toEqual(['1 318,00 kr']);
    expect(state.totalExMomsKr).toBe(1318 + 550); // 550 = utlägg
  });

  it('default rounding mode is per-row when not specified', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: FRACTIONAL_HOURS,
    });
    const arvodeAmt = state.patches.find((p) => p.row === 1 && p.col === 2);
    expect(arvodeAmt?.paragraphs).toEqual(['1 318,00 kr']);
  });

  it('sum-only mode keeps per-row exact and rounds total at the end', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: FRACTIONAL_HOURS,
      roundingMode: 'sum-only',
    });
    // Per-row stays at 1317,50 (no rounding to whole kr)
    const arvodeAmt = state.patches.find((p) => p.row === 1 && p.col === 2);
    expect(arvodeAmt?.paragraphs).toEqual(['1 317,50 kr']);
    // Total = 1317.50 + 550 = 1867.50 → rounded to whole kr = 1868
    expect(state.totalExMomsKr).toBe(1868);
  });

  it('sum-only with two fractional rows: each shows decimals, total rounded once', () => {
    // Two rows that each carry öre, summing to a half-öre.
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      // 0.55 × 850 = 467.50;  0.45 × 850 = 382.50;  sum = 850.00 + 550 utlägg
      hours: { ...ZERO_HOURS, arvode: 0.55, tidsspillan: 0.45 },
      roundingMode: 'sum-only',
    });
    const arvodeAmt = state.patches.find((p) => p.row === 1 && p.col === 2);
    const tidsAmt = state.patches.find((p) => p.row === 3 && p.col === 2);
    expect(arvodeAmt?.paragraphs).toEqual(['467,50 kr']);
    expect(tidsAmt?.paragraphs).toEqual(['382,50 kr']);
    expect(state.totalExMomsKr).toBe(467.5 + 382.5 + 550); // 1400 exact
  });

  it('per-row mode propagates rounding error to the total (sum of rounded ≠ rounded sum)', () => {
    // Two rows that each round UP — drift accumulates.
    // 0.51 × 850 = 433.50 → 434
    // 0.49 × 850 = 416.50 → 417
    // per-row sum:  434 + 417 + 550 = 1401
    // exact sum:    433.50 + 416.50 + 550 = 1400  (sum-only would give this)
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 0.51, tidsspillan: 0.49 },
      roundingMode: 'per-row',
    });
    expect(state.totalExMomsKr).toBe(1401);
  });
});

describe('computeArvode — per-category rate override', () => {
  const FIRM_RATES = {
    arvode: 1626,
    arvodeHelg: 3256,
    tidsspillan: 1487,
    tidsspillanOvrigTid: 975,
  };

  it('uses each category-specific rate from categoryRatesKr', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: {
        ...ZERO_HOURS,
        arvode: 2,
        arvodeHelg: 1,
        tidsspillan: 1,
        tidsspillanOvrigTid: 1,
      },
      categoryRatesKr: FIRM_RATES,
    });
    const arvodeAmt = state.patches.find((p) => p.row === 1 && p.col === 2);
    const helgAmt = state.patches.find((p) => p.row === 2 && p.col === 2);
    const tidsAmt = state.patches.find((p) => p.row === 3 && p.col === 2);
    const tidsOvrigAmt = state.patches.find((p) => p.row === 4 && p.col === 2);
    expect(arvodeAmt?.paragraphs).toEqual(['3 252,00 kr']); // 2 × 1626
    expect(helgAmt?.paragraphs).toEqual(['3 256,00 kr']); // 1 × 3256
    expect(tidsAmt?.paragraphs).toEqual(['1 487,00 kr']); // 1 × 1487
    expect(tidsOvrigAmt?.paragraphs).toEqual(['975,00 kr']); // 1 × 975
    // Total = 3252 + 3256 + 1487 + 975 + 550 utlägg = 9520
    expect(state.totalExMomsKr).toBe(9520);
  });

  it('rewrites the spec column with the per-category rate', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvodeHelg: 1.5 },
      categoryRatesKr: FIRM_RATES,
    });
    const helgSpec = state.patches.find((p) => p.row === 2 && p.col === 1);
    expect(helgSpec?.paragraphs).toEqual(['1,50 á 3 256 kr']);
  });

  it('without categoryRatesKr falls back to parseRateKr (doc-driven)', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 1 },
    });
    const arvodeAmt = state.patches.find((p) => p.row === 1 && p.col === 2);
    expect(arvodeAmt?.paragraphs).toEqual(['850,00 kr']); // doc rate
  });

  it('per-category rates + sum-only stack — exact products, rounded total', () => {
    // 1.55 × 1626 = 2520.30 → kept exact in sum-only mode
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 1.55 },
      categoryRatesKr: FIRM_RATES,
      roundingMode: 'sum-only',
    });
    const arvodeAmt = state.patches.find((p) => p.row === 1 && p.col === 2);
    expect(arvodeAmt?.paragraphs).toEqual(['2 520,30 kr']);
    // Total = 2520.30 + 550 = 3070.30 → rounded to 3070
    expect(state.totalExMomsKr).toBe(3070);
  });
});

describe('computeArvode — utlaggExMomsKr cross-processor input', () => {
  it('clears the UTLÄGG row spec col and writes the canonical kr amount', () => {
    // The user's UTLÄGG row had "1.00" in spec; with utlaggExMomsKr
    // provided we drop that and write the amount directly.
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 1 },
      utlaggExMomsKr: 1597,
    });
    const utlaggSpec = state.patches.find(
      (p) => p.row === 5 && p.col === 1 && p.paragraphs.length === 0,
    );
    const utlaggAmt = state.patches.find(
      (p) => p.row === 5 && p.col === 2 && p.paragraphs.join('') === '1 597,00 kr',
    );
    expect(utlaggSpec).toBeDefined();
    expect(utlaggAmt).toBeDefined();
  });

  it('uses utlaggExMomsKr in the moms-base total instead of the existing cell', () => {
    // STD_TABLE has "550 kr" in the UTLÄGG row's amount cell. With
    // utlaggExMomsKr=1597 supplied, the total should pick 1597 not 550.
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 2 },
      utlaggExMomsKr: 1597,
    });
    // 2 × 850 (doc rate) + 1597 utlägg = 3297, NOT 2 × 850 + 550 = 2250.
    expect(state.totalExMomsKr).toBe(2 * 850 + 1597);
  });

  it('falls back to existing UTLÄGG cell when utlaggExMomsKr is undefined', () => {
    // STD_TABLE: arvode row spec rate = 850, utlägg amount cell = 550.
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 1 },
      // no utlaggExMomsKr
    });
    // No spec patch on row 5 (left untouched), no fresh amount patch.
    const utlaggSpec = state.patches.find((p) => p.row === 5 && p.col === 1);
    const utlaggAmt = state.patches.find((p) => p.row === 5 && p.col === 2);
    expect(utlaggSpec).toBeUndefined();
    expect(utlaggAmt).toBeUndefined();
    // Total uses the cell value (550).
    expect(state.totalExMomsKr).toBe(850 + 550);
  });

  it('deletes the UTLÄGG row when utlaggExMomsKr is 0', () => {
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: false,
      hearingMinutes: 0,
      hours: { ...ZERO_HOURS, arvode: 1 },
      utlaggExMomsKr: 0,
    });
    expect(state.rowsToDelete).toContain(5);
  });

  it('uses utlaggExMomsKr in the taxa path total too', () => {
    // Taxa path: arvode = taxa amount; utlägg added separately.
    // 75 minutes → 5106 kr taxa. Plus 1597 utlägg = 6703.
    const state = computeArvode({
      read: makeRead(STD_TABLE),
      useTaxa: true,
      hearingMinutes: 75,
      hours: ZERO_HOURS,
      utlaggExMomsKr: 1597,
    });
    expect(state.totalExMomsKr).toBe(5106 + 1597);
    // And the row's spec col is cleared + amount written.
    const utlaggSpec = state.patches.find(
      (p) => p.row === 5 && p.col === 1 && p.paragraphs.length === 0,
    );
    expect(utlaggSpec).toBeDefined();
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
      warnings: [],
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
      warnings: [],
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
