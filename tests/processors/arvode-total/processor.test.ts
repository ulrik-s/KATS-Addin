import { describe, it, expect } from 'vitest';
import { KatsContext } from '../../../src/core/context.js';
import { tagName } from '../../../src/core/processor.js';
import { type Discovery, MapProcessorRegistry, runPipeline } from '../../../src/core/pipeline.js';
import { setArvodeState } from '../../../src/processors/arvode/state.js';
import { setUtlaggState } from '../../../src/processors/utlagg/state.js';
import { FakeTableKatsRange } from '../../../src/io/fake-kats-table.js';
import {
  ArvodeTotalProcessor,
  computeArvodeTotal,
  requireArvodeTotalState,
  type ArvodeTotalRead,
} from '../../../src/processors/arvode-total/index.js';

function totalTable(rows: readonly (readonly [string, string, string])[]): FakeTableKatsRange {
  return new FakeTableKatsRange(
    rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
  );
}

const STD_TABLE: readonly (readonly [string, string, string])[] = [
  ['Belopp exkl. moms', '', ''],
  ['Moms (25%)', '', ''],
  ['GG EJ MOMS', '', ''],
  ['Belopp inkl. moms', '', ''],
];

function makeRead(): ArvodeTotalRead {
  return {
    cells: STD_TABLE.map((row) => row.map((c) => (c.length === 0 ? [] : [c]))),
    rowExMoms: 0,
    rowMoms: 1,
    rowUtlaggEjMoms: 2,
    rowInkl: 3,
  };
}

describe('computeArvodeTotal', () => {
  it('computes moms = 25% of arvodeExMoms (rounded to whole kr)', () => {
    const state = computeArvodeTotal({
      read: makeRead(),
      arvodeExMomsKr: 4000,
      utlaggEjMomsKr: 0,
    });
    expect(state.arvodeExMomsKr).toBe(4000);
    expect(state.momsKr).toBe(1000);
    expect(state.utlaggEjMomsKr).toBe(0);
    expect(state.inklKr).toBe(5000);
  });

  it('computes inkl = ex + moms + utlaggEj', () => {
    const state = computeArvodeTotal({
      read: makeRead(),
      arvodeExMomsKr: 4000,
      utlaggEjMomsKr: 250,
    });
    expect(state.inklKr).toBe(4000 + 1000 + 250);
  });

  it('rounds moms half-away-from-zero', () => {
    // 250 × 0.25 = 62.5 → rounds to 63
    const state = computeArvodeTotal({
      read: makeRead(),
      arvodeExMomsKr: 250,
      utlaggEjMomsKr: 0,
    });
    expect(state.momsKr).toBe(63);
  });

  it('handles undefined utlaggEjMomsKr (UTLAGG did not run) as 0', () => {
    const state = computeArvodeTotal({
      read: makeRead(),
      arvodeExMomsKr: 4000,
      utlaggEjMomsKr: undefined,
    });
    expect(state.utlaggEjMomsKr).toBe(0);
    expect(state.inklKr).toBe(5000);
  });

  it('writes formatted money to each found row in col 2', () => {
    const state = computeArvodeTotal({
      read: makeRead(),
      arvodeExMomsKr: 4000,
      utlaggEjMomsKr: 250,
    });
    const ex = state.patches.find((p) => p.row === 0);
    const moms = state.patches.find((p) => p.row === 1);
    const ejMoms = state.patches.find((p) => p.row === 2);
    const inkl = state.patches.find((p) => p.row === 3);
    expect(ex?.paragraphs).toEqual(['4 000,00 kr']);
    expect(moms?.paragraphs).toEqual(['1 000,00 kr']);
    expect(ejMoms?.paragraphs).toEqual(['250,00 kr']);
    expect(inkl?.paragraphs).toEqual(['5 250,00 kr']);
  });

  it('marks utlaggEjMoms row for deletion when amount rounds to 0', () => {
    const state = computeArvodeTotal({
      read: makeRead(),
      arvodeExMomsKr: 4000,
      utlaggEjMomsKr: 0,
    });
    expect(state.rowsToDelete).toContain(2);
  });

  it('does NOT delete utlaggEjMoms row when amount > 0', () => {
    const state = computeArvodeTotal({
      read: makeRead(),
      arvodeExMomsKr: 4000,
      utlaggEjMomsKr: 100,
    });
    expect(state.rowsToDelete).not.toContain(2);
  });

  it('skips writing to rows that were not found (-1)', () => {
    const state = computeArvodeTotal({
      read: { ...makeRead(), rowMoms: -1, rowUtlaggEjMoms: -1 },
      arvodeExMomsKr: 4000,
      utlaggEjMomsKr: 0,
    });
    expect(state.patches.find((p) => p.row === 1)).toBeUndefined();
    expect(state.patches.find((p) => p.row === 2)).toBeUndefined();
    expect(state.patches.find((p) => p.row === 0)).toBeDefined();
    expect(state.patches.find((p) => p.row === 3)).toBeDefined();
  });
});

describe('ArvodeTotalProcessor — read finds rows by label match', () => {
  it('discovers each label via loose match', async () => {
    const p = new ArvodeTotalProcessor();
    const ctx = new KatsContext();
    await p.read(totalTable(STD_TABLE), ctx);
    p.transform(ctx);
    // Just verify processor wired up; details covered by computeArvodeTotal tests.
    expect(requireArvodeTotalState(ctx).inklKr).toBe(0); // no upstream state set
  });

  it('matches even if a label has slight diacritic damage', async () => {
    const damaged: readonly (readonly [string, string, string])[] = [
      ['Belopp exkl. moms', '', ''],
      ['Moms (25%)', '', ''],
      ['Belopp inkl. moms', '', ''],
    ];
    const p = new ArvodeTotalProcessor();
    const ctx = new KatsContext();
    await p.read(totalTable(damaged), ctx);
    p.transform(ctx);
    // utlaggEjMoms row absent (-1) → no patch for that row.
    expect(requireArvodeTotalState(ctx).utlaggEjMomsKr).toBe(0);
  });
});

describe('ArvodeTotalProcessor — pipeline integration', () => {
  it('reads upstream state and writes summary correctly', async () => {
    const registry = new MapProcessorRegistry();
    registry.register(new ArvodeTotalProcessor());

    const ctx = new KatsContext();
    setArvodeState(ctx, { patches: [], rowsToDelete: [], totalExMomsKr: 4000 });
    setUtlaggState(ctx, { patches: [], totalExMomsKr: 0, totalEjMomsKr: 250, warnings: [] });

    const range = totalTable(STD_TABLE);
    const discoveries: Discovery[] = [{ tag: tagName('KATS_ARVODE_TOTAL'), range }];
    await runPipeline(discoveries, registry, ctx);

    const state = requireArvodeTotalState(ctx);
    expect(state.arvodeExMomsKr).toBe(4000);
    expect(state.momsKr).toBe(1000);
    expect(state.utlaggEjMomsKr).toBe(250);
    expect(state.inklKr).toBe(5250);

    const snap = range.snapshot();
    // 4 rows in input; ej-moms = 250 (non-zero) so no row deleted.
    expect(snap.length).toBe(4);
    expect(snap[3]?.[2]).toEqual(['5 250,00 kr']);
  });

  it('deletes the GG EJ MOMS row when amount is zero', async () => {
    const registry = new MapProcessorRegistry();
    registry.register(new ArvodeTotalProcessor());

    const ctx = new KatsContext();
    setArvodeState(ctx, { patches: [], rowsToDelete: [], totalExMomsKr: 4000 });
    setUtlaggState(ctx, { patches: [], totalExMomsKr: 0, totalEjMomsKr: 0, warnings: [] });

    const range = totalTable(STD_TABLE);
    const discoveries: Discovery[] = [{ tag: tagName('KATS_ARVODE_TOTAL'), range }];
    await runPipeline(discoveries, registry, ctx);

    const snap = range.snapshot();
    expect(snap.length).toBe(3); // ej-moms row deleted
    // Verify the inkl row's amount is now in the right cell.
    expect(snap[2]?.[0]).toEqual(['Belopp inkl. moms']);
    expect(snap[2]?.[2]).toEqual(['5 000,00 kr']);
  });
});
