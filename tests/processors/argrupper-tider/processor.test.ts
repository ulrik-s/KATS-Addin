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

describe('computeArgrupper — English / drifted heading aliases', () => {
  // Cecilia's bug-report doc: English headings + summary, plus a Swedish
  // Tidsspillan section. Before alias support, all categories returned 0.
  const ENGLISH_TABLE: readonly (readonly string[])[] = [
    ['Datum', 'Beskrivning', 'Antal', 'Belopp'],
    ['Fee', '', '', ''],
    ['2026-04-20', 'Granskning', '1.5', ''],
    ['2026-04-21', 'Skrift', '2', ''],
    ['Total', '', '', ''],
    ['Tidsspillan', '', '', ''],
    ['2026-04-22', 'Resa', '0.5', ''],
    ['Total', '', '', ''],
    ['Case, total', 'old', 'old', ''],
  ];

  it('matches "Fee" as Arvode and "Total" as Summa', () => {
    const state = computeArgrupper({ read: makeReadFromRows(ENGLISH_TABLE), now: NOW });
    expect(state.hours.arvode).toBe(3.5);
    expect(state.hours.tidsspillan).toBe(0.5);
  });

  it('does not emit warnings for fully-tolerated English templates', () => {
    const state = computeArgrupper({ read: makeReadFromRows(ENGLISH_TABLE), now: NOW });
    expect(state.warnings).toEqual([]);
  });

  it('clears the "Case, total" row (Ärende-total alias)', () => {
    const state = computeArgrupper({ read: makeReadFromRows(ENGLISH_TABLE), now: NOW });
    // Row 8 is "Case, total" in this table.
    expect(state.patches).toContainEqual({ row: 8, col: 0, paragraphs: [] });
    expect(state.patches).toContainEqual({ row: 8, col: 1, paragraphs: [] });
    expect(state.patches).toContainEqual({ row: 8, col: 2, paragraphs: [] });
  });

  it('writes section sums under English aliases too', () => {
    const state = computeArgrupper({ read: makeReadFromRows(ENGLISH_TABLE), now: NOW });
    const arvodeSummary = state.patches.find((p) => p.row === 4 && p.col === 2);
    const tidsSummary = state.patches.find((p) => p.row === 7 && p.col === 2);
    expect(arvodeSummary?.paragraphs).toEqual(['3,50']);
    expect(tidsSummary?.paragraphs).toEqual(['0,50']);
  });

  it('matches the "Honorarium" alias for Arvode', () => {
    const honorTable: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'Belopp'],
      ['Honorarium', '', '', ''],
      ['2026-04-20', 'x', '1', ''],
      ['Sum', '', '', ''],
    ];
    const state = computeArgrupper({ read: makeReadFromRows(honorTable), now: NOW });
    expect(state.hours.arvode).toBe(1);
  });
});

describe('computeArgrupper — diagnostic warnings', () => {
  it('emits a warning when a recognized heading has no summary row anywhere after it', () => {
    const noSummary: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'Belopp'],
      ['Arvode', '', '', ''],
      ['2026-04-20', 'x', '1.5', ''],
      // missing Summa / Total — section reaches end-of-table
    ];
    const state = computeArgrupper({ read: makeReadFromRows(noSummary), now: NOW });
    expect(state.hours.arvode).toBe(0);
    expect(state.warnings).toContainEqual(expect.stringContaining('Arvode'));
    expect(state.warnings.some((w) => w.includes('summaraden'))).toBe(true);
  });

  it('emits a "no section recognized" warning when data rows exist but no heading matches', () => {
    const driftedHeading: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'Belopp'],
      ['Arbete', '', '', ''], // not a recognized heading or alias
      ['2026-04-20', 'x', '1', ''],
      ['Summa', '', '', ''],
    ];
    const state = computeArgrupper({ read: makeReadFromRows(driftedHeading), now: NOW });
    expect(state.hours.arvode).toBe(0);
    expect(state.warnings.some((w) => w.includes('ingen sektionsrubrik hittades'))).toBe(true);
  });

  it('does NOT warn when the table is genuinely empty (no headings, no data)', () => {
    const empty: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'Belopp'],
      ['', '', '', ''],
    ];
    const state = computeArgrupper({ read: makeReadFromRows(empty), now: NOW });
    expect(state.warnings).toEqual([]);
  });

  it('does NOT warn when only some optional sections are absent', () => {
    // Only Arvode + Tidsspillan present; Arvode helg / Tidsspillan övrig tid
    // missing — that's the common case and should be silent.
    const partial: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'Belopp'],
      ['Arvode', '', '', ''],
      ['2026-04-20', 'x', '1', ''],
      ['Summa', '', '', ''],
      ['Tidsspillan', '', '', ''],
      ['2026-04-21', 'y', '0.5', ''],
      ['Summa', '', '', ''],
    ];
    const state = computeArgrupper({ read: makeReadFromRows(partial), now: NOW });
    expect(state.warnings).toEqual([]);
  });
});

describe('ArgrupperTiderProcessor — warning forwarding to context', () => {
  it('processor.transform copies state warnings into ctx.warnings', async () => {
    const driftedHeading: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'Belopp'],
      ['Arbete', '', '', ''],
      ['2026-04-20', 'x', '1', ''],
      ['Summa', '', '', ''],
    ];
    const p = new ArgrupperTiderProcessor({ now: () => NOW });
    const ctx = new KatsContext();
    await p.read(table(driftedHeading), ctx);
    p.transform(ctx);
    expect(ctx.warnings.length).toBeGreaterThan(0);
    expect(ctx.warnings).toEqual(requireArgrupperState(ctx).warnings);
  });

  it('processor leaves ctx.warnings empty when the table is canonical', async () => {
    const p = new ArgrupperTiderProcessor({ now: () => NOW });
    const ctx = new KatsContext();
    await p.read(table(TYPICAL_TABLE), ctx);
    p.transform(ctx);
    expect(ctx.warnings).toEqual([]);
  });
});

describe('regression: Cecilia bug report 2026-05-02 (KATS-Debug-1.docx)', () => {
  // Verbatim shape of Cecilia's argrupper table at the time of the bug
  // report: English "Fee"/"Total"/"Case, total" labels, period as decimal
  // separator, merged heading rows. Pre-fix this returned 0 hours for every
  // category — a high-fidelity regression so future changes can't silently
  // re-break English/drifted templates.
  const CECILIA_TABLE: readonly (readonly string[])[] = [
    ['Fee', '', ''], // gridSpan-3 heading; empty trailing cells per Word adapter
    ['2026-02-03', 'Ankom förordnande, Inledande åtgärder.', '0.75'],
    ['2026-03-05', 'Telefon till utredare.', '0.10'],
    ['2026-04-15', 'Ankom mail fr utredare ang inbokning.', '0.10'],
    ['2026-04-21', 'Medverkat vid förhör (utan taxa).', '2.10'],
    ['2026-04-21', 'Telefonsamtal genom dottern.', '0.25'],
    ['2026-04-22', 'Mottagit mail från utredaren.', '0.20'],
    ['2026-04-23', 'Telefonsamtal med utredaren.', '0.10'],
    ['2026-04-28', 'Möte med huvudman med tolk.', '1.40'],
    ['2026-04-30', 'Ankom nedläggningsbeslut.', '0.50'],
    ['Total', '', '5.50'],
    ['Tidsspillan', '', ''],
    ['2026-04-21', 'Spilltid i samband med inställelse.', '0.50'],
    ['Total', '', '0.50'],
    ['Case, total', '', '6.00'],
    ['', '', ''],
  ];

  it('computes arvode = 5.50 from Cecilia\'s "Fee" section', () => {
    const state = computeArgrupper({ read: makeReadFromRows(CECILIA_TABLE), now: NOW });
    expect(state.hours.arvode).toBe(5.5);
  });

  it("computes tidsspillan = 0.50 from Cecilia's section", () => {
    const state = computeArgrupper({ read: makeReadFromRows(CECILIA_TABLE), now: NOW });
    expect(state.hours.tidsspillan).toBe(0.5);
  });

  it('keeps the unused weekend/övrig-tid categories at 0', () => {
    const state = computeArgrupper({ read: makeReadFromRows(CECILIA_TABLE), now: NOW });
    expect(state.hours.arvodeHelg).toBe(0);
    expect(state.hours.tidsspillanOvrigTid).toBe(0);
  });

  it('does not flag taxemål and emits no warnings (clean processing)', () => {
    const state = computeArgrupper({ read: makeReadFromRows(CECILIA_TABLE), now: NOW });
    expect(state.isTaxemal).toBe(false);
    expect(state.hearingStart).toBeUndefined();
    expect(state.hearingMinutes).toBeUndefined();
    expect(state.warnings).toEqual([]);
  });

  it("clears the 'Case, total' row (Ärende-total alias)", () => {
    const state = computeArgrupper({ read: makeReadFromRows(CECILIA_TABLE), now: NOW });
    const caseTotalRow = CECILIA_TABLE.findIndex((r) => r[0] === 'Case, total');
    expect(state.patches).toContainEqual({ row: caseTotalRow, col: 0, paragraphs: [] });
    expect(state.patches).toContainEqual({ row: caseTotalRow, col: 1, paragraphs: [] });
    expect(state.patches).toContainEqual({ row: caseTotalRow, col: 2, paragraphs: [] });
  });

  it('writes the Swedish-formatted section sum to each "Total" row', () => {
    const state = computeArgrupper({ read: makeReadFromRows(CECILIA_TABLE), now: NOW });
    const arvodeTotalIdx = 10; // the first "Total" row
    const tidsTotalIdx = 13; // the second "Total" row
    expect(state.patches).toContainEqual({
      row: arvodeTotalIdx,
      col: 2,
      paragraphs: ['5,50'],
    });
    expect(state.patches).toContainEqual({
      row: tidsTotalIdx,
      col: 2,
      paragraphs: ['0,50'],
    });
  });

  it('end-to-end pipeline: ARGRUPPER state surfaces 5.50/0.50 for downstream ARVODE', async () => {
    const p = new ArgrupperTiderProcessor({ now: () => NOW });
    const registry = new MapProcessorRegistry();
    registry.register(p);
    const ctx = new KatsContext();
    const range = table(CECILIA_TABLE);
    const discoveries: Discovery[] = [
      { tag: tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'), range },
    ];
    await runPipeline(discoveries, registry, ctx);
    expect(getCategoryHoursFromContext(ctx)).toEqual({
      arvode: 5.5,
      arvodeHelg: 0,
      tidsspillan: 0.5,
      tidsspillanOvrigTid: 0,
    });
    expect(ctx.warnings).toEqual([]);
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
