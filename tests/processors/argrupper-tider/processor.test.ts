import { describe, it, expect } from 'vitest';
import { KatsContext } from '../../../src/core/context.js';
import { tagName } from '../../../src/core/processor.js';
import { type Discovery, MapProcessorRegistry, runPipeline } from '../../../src/core/pipeline.js';
import { FakeTableKatsRange } from '../../../src/io/fake-kats-table.js';
import {
  ArgrupperTiderProcessor,
  computeArgrupper,
  getCategoryHoursFromContext,
  getHearingMinutesFromContext,
  requireArgrupperState,
  shouldUseTaxaFromContext,
  type ArgrupperRead,
} from '../../../src/processors/argrupper-tider/index.js';

const NOW = new Date(2026, 3, 25, 12, 0); // 2026-04-25 12:00 local

function table(rows: readonly (readonly string[])[]): FakeTableKatsRange {
  return new FakeTableKatsRange(
    rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
  );
}

function makeReadFromRows(rows: readonly (readonly string[])[]): ArgrupperRead {
  return {
    cells: rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
  };
}

const TYPICAL_TABLE: readonly (readonly string[])[] = [
  ['Datum', 'Beskrivning', 'Antal', 'Belopp'],
  ['Arvode', '', '', ''], // heading
  ['2026-04-20', 'Granskning', '1.5', ''],
  ['2026-04-21', 'Skrift', '2', ''],
  ['Summa', '', '', ''], // summary 1
  ['Tidsspillan', '', '', ''], // heading 2
  ['2026-04-22', 'Resa', '0.5', ''],
  ['Summa', '', '', ''], // summary 2
  ['Ärende, total', 'old', 'old', ''], // total row to clear
];

describe('computeArgrupper — hours per section', () => {
  it('sums each section and rounds to 2 decimals', () => {
    const state = computeArgrupper({ read: makeReadFromRows(TYPICAL_TABLE), now: NOW });
    expect(state.hours.arvode).toBe(3.5);
    expect(state.hours.tidsspillan).toBe(0.5);
    expect(state.hours.arvodeHelg).toBe(0);
    expect(state.hours.tidsspillanOvrigTid).toBe(0);
  });

  it('writes section sums to summary rows', () => {
    const state = computeArgrupper({ read: makeReadFromRows(TYPICAL_TABLE), now: NOW });
    const arvodeSummary = state.patches.find((p) => p.row === 4 && p.col === 2);
    const tidsSummary = state.patches.find((p) => p.row === 7 && p.col === 2);
    expect(arvodeSummary?.paragraphs).toEqual(['3,50']);
    expect(tidsSummary?.paragraphs).toEqual(['0,50']);
  });

  it('clears the "Ärende, total" row (cols 0–2)', () => {
    const state = computeArgrupper({ read: makeReadFromRows(TYPICAL_TABLE), now: NOW });
    expect(state.patches).toContainEqual({ row: 8, col: 0, paragraphs: [] });
    expect(state.patches).toContainEqual({ row: 8, col: 1, paragraphs: [] });
    expect(state.patches).toContainEqual({ row: 8, col: 2, paragraphs: [] });
  });

  it('isTaxemal stays false when no "enligt taxa" present', () => {
    const state = computeArgrupper({ read: makeReadFromRows(TYPICAL_TABLE), now: NOW });
    expect(state.isTaxemal).toBe(false);
  });

  it('captures no hearing time when no hearing line present', () => {
    const state = computeArgrupper({ read: makeReadFromRows(TYPICAL_TABLE), now: NOW });
    expect(state.hearingStart).toBeUndefined();
    expect(state.hearingMinutes).toBeUndefined();
  });
});

describe('computeArgrupper — taxemål detection + hearing time', () => {
  const HEARING_TABLE: readonly (readonly string[])[] = [
    ['Datum', 'Beskrivning', 'Antal', 'Belopp'],
    ['Arvode', '', '', ''],
    ['2026-04-25', 'medverkat vid förhandling från kl. 09:00, enligt taxa', '', ''],
    ['Summa', '', '', ''],
  ];

  it('detects taxemål via "enligt taxa" anywhere in the table', () => {
    const state = computeArgrupper({ read: makeReadFromRows(HEARING_TABLE), now: NOW });
    expect(state.isTaxemal).toBe(true);
  });

  it('extracts hearing start and minutes', () => {
    const state = computeArgrupper({ read: makeReadFromRows(HEARING_TABLE), now: NOW });
    expect(state.hearingStart).toBeInstanceOf(Date);
    // Start = 2026-04-25 09:00, now = 12:00 → 180 minutes.
    expect(state.hearingMinutes).toBe(180);
  });

  it('writes computed hours back to the hearing row col 2', () => {
    const state = computeArgrupper({ read: makeReadFromRows(HEARING_TABLE), now: NOW });
    const hearingPatch = state.patches.find((p) => p.row === 2 && p.col === 2);
    expect(hearingPatch?.paragraphs).toEqual(['3,00']); // 180/60 = 3.00
  });

  it('matches diacritic-stripped legacy hearing text', () => {
    const legacy: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'Belopp'],
      ['Arvode', '', '', ''],
      ['2026-04-25', 'medverkat vid forhandling fran kl. 09:00', '', ''],
      ['Summa', '', '', ''],
    ];
    const state = computeArgrupper({ read: makeReadFromRows(legacy), now: NOW });
    expect(state.hearingStart).toBeInstanceOf(Date);
    expect(state.hearingMinutes).toBe(180);
  });

  it('uses current calendar day when row date column is non-ISO', () => {
    const noIsoDate: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'Belopp'],
      ['Arvode', '', '', ''],
      ['(no date)', 'medverkat vid förhandling från kl. 09:00', '', ''],
      ['Summa', '', '', ''],
    ];
    const state = computeArgrupper({ read: makeReadFromRows(noIsoDate), now: NOW });
    // Now is 2026-04-25 12:00; hearing fallback is today 09:00 → 180 min.
    expect(state.hearingMinutes).toBe(180);
  });
});

describe('shouldUseTaxaFromContext — cross-processor decision', () => {
  it('returns true when isTaxemal AND hearing AND minutes ≤ 225', async () => {
    const p = new ArgrupperTiderProcessor({ now: () => NOW });
    const ctx = new KatsContext();
    const HEARING_TABLE: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'Belopp'],
      ['Arvode', '', '', ''],
      ['2026-04-25', 'medverkat vid förhandling från kl. 09:00, enligt taxa', '', ''],
      ['Summa', '', '', ''],
    ];
    await p.read(table(HEARING_TABLE), ctx);
    p.transform(ctx);
    expect(shouldUseTaxaFromContext(ctx)).toBe(true);
    expect(getHearingMinutesFromContext(ctx)).toBe(180);
  });

  it('returns false when not taxemål', async () => {
    const p = new ArgrupperTiderProcessor({ now: () => NOW });
    const ctx = new KatsContext();
    await p.read(table(TYPICAL_TABLE), ctx);
    p.transform(ctx);
    expect(shouldUseTaxaFromContext(ctx)).toBe(false);
  });

  it('returns false when minutes > 225', async () => {
    // Hearing started 4 hours ago → 240 min > 225.
    const overTaxa: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'Belopp'],
      ['Arvode', '', '', ''],
      ['2026-04-25', 'medverkat vid förhandling från kl. 08:00, enligt taxa', '', ''],
      ['Summa', '', '', ''],
    ];
    const p = new ArgrupperTiderProcessor({ now: () => NOW });
    const ctx = new KatsContext();
    await p.read(table(overTaxa), ctx);
    p.transform(ctx);
    expect(getHearingMinutesFromContext(ctx)).toBe(240);
    expect(shouldUseTaxaFromContext(ctx)).toBe(false);
  });

  it('returns false when context has no Argrupper state', () => {
    expect(shouldUseTaxaFromContext(new KatsContext())).toBe(false);
  });
});

describe('ArgrupperTiderProcessor — render and pipeline integration', () => {
  it('writes patches to the table', async () => {
    const p = new ArgrupperTiderProcessor({ now: () => NOW });
    const ctx = new KatsContext();
    const range = table(TYPICAL_TABLE);
    await p.read(range, ctx);
    p.transform(ctx);
    await p.render(range, ctx);
    const snap = range.snapshot();
    expect(snap[4]?.[2]).toEqual(['3,50']);
    expect(snap[7]?.[2]).toEqual(['0,50']);
    expect(snap[8]?.[0]).toEqual([]);
    expect(snap[8]?.[1]).toEqual([]);
    expect(snap[8]?.[2]).toEqual([]);
  });

  it('runs end-to-end via runPipeline and surfaces hours', async () => {
    const p = new ArgrupperTiderProcessor({ now: () => NOW });
    const registry = new MapProcessorRegistry();
    registry.register(p);
    const ctx = new KatsContext();
    const range = table(TYPICAL_TABLE);
    const discoveries: Discovery[] = [
      { tag: tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'), range },
    ];
    await runPipeline(discoveries, registry, ctx);
    expect(getCategoryHoursFromContext(ctx)).toEqual({
      arvode: 3.5,
      arvodeHelg: 0,
      tidsspillan: 0.5,
      tidsspillanOvrigTid: 0,
    });
    expect(requireArgrupperState(ctx).isTaxemal).toBe(false);
  });
});
