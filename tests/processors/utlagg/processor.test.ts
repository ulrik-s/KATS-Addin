import { describe, it, expect } from 'vitest';
import { KatsContext } from '../../../src/core/context.js';
import { ProcessorError } from '../../../src/core/errors.js';
import { tagName } from '../../../src/core/processor.js';
import { type Discovery, MapProcessorRegistry, runPipeline } from '../../../src/core/pipeline.js';
import { type KatsUser } from '../../../src/domain/user-db.js';
import { FakeTextKatsRange } from '../../../src/io/fake-kats-range.js';
import { FakeTableKatsRange } from '../../../src/io/fake-kats-table.js';
import {
  UTLAGG_COL,
  UtlaggProcessor,
  computeUtlagg,
  getUtlaggTotalsFromContext,
  requireUtlaggState,
  type UtlaggRead,
} from '../../../src/processors/utlagg/index.js';

const ULRIK: KatsUser = {
  key: 'ulrik',
  shortName: 'Ulrik',
  fullName: 'Ulrik Sjölin',
  mileageKrPerKm: 25,
  title: 'Advokat',
  city: 'Lund',
  aliases: [],
};

function makeProcessor(user: KatsUser = ULRIK): UtlaggProcessor {
  return new UtlaggProcessor({ getCurrentUser: (): KatsUser => user });
}

/** Build a 5-column table from string-cell input (one paragraph per cell). */
function table5(rows: readonly (readonly string[])[]): FakeTableKatsRange {
  return new FakeTableKatsRange(
    rows.map((row) => {
      if (row.length !== 5) throw new Error('test row must have 5 cells');
      return row.map((cell) => (cell.length === 0 ? [] : [cell]));
    }),
  );
}

/** Reusable example: one VAT section with 2 data rows + summary, one VAT-free section. */
const STD_TABLE: readonly (readonly string[])[] = [
  ['Datum', 'Beskrivning', 'Antal', 'á-pris', 'Belopp'],
  ['Utlägg', '', '', '', ''], // heading row 1
  ['2026-04-01', 'Tågbiljett', '1', '550', ''],
  ['2026-04-02', 'Milersättning', '120', '', ''], // mileage row, qty=120 km
  ['Summa', '', '', '', ''], // summary row 1
  ['Utlägg momsfri', '', '', '', ''], // heading row 2
  ['2026-04-03', 'Domstolsavgift', '1', '900', ''],
  ['Summa', '', '', '', ''], // summary row 2
];

describe('UtlaggProcessor — read', () => {
  it('captures the full table snapshot', async () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    await p.read(table5(STD_TABLE), ctx);
    p.transform(ctx);
    expect(requireUtlaggState(ctx).totalExMomsKr).toBeGreaterThan(0);
  });

  it('throws if given a text range', async () => {
    const p = makeProcessor();
    await expect(p.read(new FakeTextKatsRange(), new KatsContext())).rejects.toBeInstanceOf(
      ProcessorError,
    );
  });

  it('throws if column count is below 5', async () => {
    const p = makeProcessor();
    const range = new FakeTableKatsRange([[[''], [''], [''], ['']]]); // 4 cols
    await expect(p.read(range, new KatsContext())).rejects.toBeInstanceOf(ProcessorError);
  });
});

describe('UtlaggProcessor — transform (computeUtlagg pure logic)', () => {
  function makeRead(): UtlaggRead {
    return {
      cells: STD_TABLE.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
    };
  }

  it('sums VAT and VAT-free sections to whole kronor', () => {
    const state = computeUtlagg({ read: makeRead(), mileageKrPerKm: 25 });
    // Row 1: 1 × 550 = 550
    // Row 2: mileage 120 × 25 = 3000
    expect(state.totalExMomsKr).toBe(550 + 3000);
    // Row 3: 1 × 900 = 900
    expect(state.totalEjMomsKr).toBe(900);
  });

  it('applies the mileage rate from user instead of cell rate', () => {
    const state = computeUtlagg({ read: makeRead(), mileageKrPerKm: 30 });
    expect(state.totalExMomsKr).toBe(550 + 120 * 30);
  });

  it('rewrites the rate cell on mileage rows with the user mileage rate', () => {
    // Mileage rate gets the canonical Swedish integer format ("25"
    // when the rate is whole kronor; would gain ",NN" decimals if
    // fractional).
    const state = computeUtlagg({ read: makeRead(), mileageKrPerKm: 25 });
    const ratePatch = state.patches.find((p) => p.row === 3 && p.col === 3);
    expect(ratePatch?.paragraphs).toEqual(['25']);
  });

  it('renders fractional mileage rate with 2 decimals', () => {
    const state = computeUtlagg({ read: makeRead(), mileageKrPerKm: 25.5 });
    const ratePatch = state.patches.find((p) => p.row === 3 && p.col === 3);
    expect(ratePatch?.paragraphs).toEqual(['25,50']);
  });

  it('writes the computed amount to col 4 of each data row', () => {
    const state = computeUtlagg({ read: makeRead(), mileageKrPerKm: 25 });
    const amt1 = state.patches.find((p) => p.row === 2 && p.col === 4);
    const amt2 = state.patches.find((p) => p.row === 3 && p.col === 4);
    expect(amt1?.paragraphs).toEqual(['550']);
    expect(amt2?.paragraphs).toEqual(['3 000']);
  });

  it('clears summary qty cell and writes total to summary amount cell', () => {
    const state = computeUtlagg({ read: makeRead(), mileageKrPerKm: 25 });
    const summaryRow = 4;
    const qtyClear = state.patches.find((p) => p.row === summaryRow && p.col === 2);
    const summaryAmt = state.patches.find((p) => p.row === summaryRow && p.col === 4);
    expect(qtyClear?.paragraphs).toEqual([]);
    expect(summaryAmt?.paragraphs).toEqual(['3 550']);
  });

  it('returns 0/0 totals when sections are absent', () => {
    const empty = computeUtlagg({
      read: { cells: [[[''], [''], [''], [''], ['']]] },
      mileageKrPerKm: 25,
    });
    expect(empty.totalExMomsKr).toBe(0);
    expect(empty.totalEjMomsKr).toBe(0);
    expect(empty.patches).toEqual([]);
  });

  it('uses existing amount when qty or rate is zero', () => {
    const read: UtlaggRead = {
      cells: [
        [['Datum'], ['Beskr'], ['Antal'], ['á'], ['Belopp']],
        [['Utlägg'], [], [], [], []],
        [['2026-04-01'], ['Egendefinierad'], [], [], ['1 234']], // qty=0, rate=0, amt=1234
        [['Summa'], [], [], [], []],
      ],
    };
    const state = computeUtlagg({ read, mileageKrPerKm: 25 });
    expect(state.totalExMomsKr).toBe(1234);
  });

  it('does NOT apply mileage rule in the VAT-free section', () => {
    const read: UtlaggRead = {
      cells: [
        [['Datum'], ['Beskr'], ['Antal'], ['á'], ['Belopp']],
        [['Utlägg momsfri'], [], [], [], []],
        [['2026-04-01'], ['Milersättning'], ['100'], ['10'], []], // would be 1000 if mileage rule fired
        [['Summa'], [], [], [], []],
      ],
    };
    const state = computeUtlagg({ read, mileageKrPerKm: 99 });
    // Mileage rule disabled here → use cell rate of 10.
    expect(state.totalEjMomsKr).toBe(100 * 10);
    // The rate IS normalized (every data row is) but to the user's
    // value (10), not overwritten with the mileage default (99).
    const ratePatch = state.patches.find((p) => p.row === 2 && p.col === 3);
    expect(ratePatch?.paragraphs).toEqual(['10']);
  });

  it('matches "Milersättning" loosely (encoding-mangled forms)', () => {
    const variants = ['Milersättning', 'Milersattning', 'milers.ttning', 'MILERSÄTTNING'];
    for (const desc of variants) {
      const read: UtlaggRead = {
        cells: [
          [['Datum'], ['Beskr'], ['Antal'], ['á'], ['Belopp']],
          [['Utlägg'], [], [], [], []],
          [['2026-04-01'], [desc], ['10'], [], []],
          [['Summa'], [], [], [], []],
        ],
      };
      const state = computeUtlagg({ read, mileageKrPerKm: 25 });
      expect(state.totalExMomsKr, `for "${desc}"`).toBe(250);
    }
  });

  it('skips non-data rows between heading and summary', () => {
    const read: UtlaggRead = {
      cells: [
        [['Utlägg'], [], [], [], []],
        [[''], ['blank line'], [], [], []], // not a data row (no ISO date)
        [['2026-04-01'], ['x'], ['1'], ['100'], []],
        [['Summa'], [], [], [], []],
      ],
    };
    const state = computeUtlagg({ read, mileageKrPerKm: 25 });
    expect(state.totalExMomsKr).toBe(100);
  });
});

describe('UtlaggProcessor — English / drifted heading aliases', () => {
  // Cecilia's bug-report doc shape: "Expenses" + "Total" instead of
  // "Utlägg" + "Summa". Should still compute the section total.
  const ENGLISH_TABLE: readonly (readonly string[])[] = [
    ['Datum', 'Beskrivning', 'Antal', 'á-pris', 'Belopp'],
    ['Expenses', '', '', '', ''],
    ['2026-04-30', 'Tolk', '1', '1597', ''],
    ['Total', '', '', '', ''],
  ];

  function makeRead(rows: readonly (readonly string[])[]): UtlaggRead {
    return {
      cells: rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
    };
  }

  it('matches "Expenses" as Utlägg and "Total" as Summa', () => {
    const state = computeUtlagg({ read: makeRead(ENGLISH_TABLE), mileageKrPerKm: 25 });
    expect(state.totalExMomsKr).toBe(1597);
    expect(state.warnings).toEqual([]);
  });

  it('matches the "Disbursements" alias for Utlägg', () => {
    const variant: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['Disbursements', '', '', '', ''],
      ['2026-04-01', 'Tolk', '1', '500', ''],
      ['Sum', '', '', '', ''],
    ];
    const state = computeUtlagg({ read: makeRead(variant), mileageKrPerKm: 25 });
    expect(state.totalExMomsKr).toBe(500);
  });

  it('matches the "VAT-free expenses" alias for Utlägg momsfri', () => {
    const variant: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['VAT-free expenses', '', '', '', ''],
      ['2026-04-01', 'Domstolsavgift', '1', '900', ''],
      ['Total', '', '', '', ''],
    ];
    const state = computeUtlagg({ read: makeRead(variant), mileageKrPerKm: 25 });
    expect(state.totalEjMomsKr).toBe(900);
  });
});

describe('UtlaggProcessor — qty + rate cell normalization', () => {
  // Standardize input cells to Swedish notation: comma decimal +
  // space thousands. Users may have typed English-format values that
  // happen to parse correctly; we still re-render in Swedish so the
  // document is monolingual.
  function makeRead(rows: readonly (readonly string[])[]): UtlaggRead {
    return {
      cells: rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
    };
  }

  it('rewrites English-format qty "1.00" as "1" (integer)', () => {
    const read = makeRead([
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['Utlägg', '', '', '', ''],
      ['2026-04-30', 'Tolk', '1.00', '500', ''],
      ['Summa', '', '', '', ''],
    ]);
    const state = computeUtlagg({ read, mileageKrPerKm: 25 });
    const qtyPatch = state.patches.find((p) => p.row === 2 && p.col === 2);
    expect(qtyPatch?.paragraphs).toEqual(['1']);
  });

  it('rewrites English-format rate "1,597" as "1 597" (thousand-space)', () => {
    const read = makeRead([
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['Utlägg', '', '', '', ''],
      ['2026-04-30', 'Tolk', '1', '1,597', ''],
      ['Summa', '', '', '', ''],
    ]);
    const state = computeUtlagg({ read, mileageKrPerKm: 25 });
    const ratePatch = state.patches.find((p) => p.row === 2 && p.col === 3);
    expect(ratePatch?.paragraphs).toEqual(['1 597']);
  });

  it('renders fractional qty with 2 decimals + comma', () => {
    const read = makeRead([
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['Utlägg', '', '', '', ''],
      ['2026-04-30', 'Tolk', '0.75', '500', ''],
      ['Summa', '', '', '', ''],
    ]);
    const state = computeUtlagg({ read, mileageKrPerKm: 25 });
    const qtyPatch = state.patches.find((p) => p.row === 2 && p.col === 2);
    expect(qtyPatch?.paragraphs).toEqual(['0,75']);
  });

  it('renders large rates with thousand-space and 2 decimals when fractional', () => {
    const read = makeRead([
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['Utlägg', '', '', '', ''],
      ['2026-04-30', 'x', '1', '12345.67', ''],
      ['Summa', '', '', '', ''],
    ]);
    const state = computeUtlagg({ read, mileageKrPerKm: 25 });
    const ratePatch = state.patches.find((p) => p.row === 2 && p.col === 3);
    expect(ratePatch?.paragraphs).toEqual(['12 345,67']);
  });

  it('does not patch qty/rate when both are empty (no-op row)', () => {
    const read = makeRead([
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['Utlägg', '', '', '', ''],
      ['2026-04-30', 'Tolk', '', '', '500'],
      ['Summa', '', '', '', ''],
    ]);
    const state = computeUtlagg({ read, mileageKrPerKm: 25 });
    const qtyPatch = state.patches.find((p) => p.row === 2 && p.col === 2);
    const ratePatch = state.patches.find((p) => p.row === 2 && p.col === 3);
    expect(qtyPatch).toBeUndefined();
    expect(ratePatch).toBeUndefined();
    // existingAmount of 500 still flows through to the total.
    expect(state.totalExMomsKr).toBe(500);
  });
});

describe('UtlaggProcessor — alias → Swedish label rewriting', () => {
  // Same intent as argrupper: tolerate English on input, write Swedish
  // back to the rendered doc so it ends up monolingual.
  const ENGLISH_TABLE: readonly (readonly string[])[] = [
    ['Datum', 'Beskrivning', 'Antal', 'á-pris', 'Belopp'],
    ['Expenses', '', '', '', ''],
    ['2026-04-30', 'Tolk', '1', '1597', ''],
    ['Total', '', '', '', ''],
  ];

  function makeRead(rows: readonly (readonly string[])[]): UtlaggRead {
    return {
      cells: rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
    };
  }

  it('rewrites the section heading from "Expenses" to "Utlägg"', () => {
    const state = computeUtlagg({ read: makeRead(ENGLISH_TABLE), mileageKrPerKm: 25 });
    expect(state.patches).toContainEqual({ row: 1, col: 0, paragraphs: ['Utlägg'] });
  });

  it('rewrites the "Total" summary row to "Summa"', () => {
    const state = computeUtlagg({ read: makeRead(ENGLISH_TABLE), mileageKrPerKm: 25 });
    expect(state.patches).toContainEqual({ row: 3, col: 0, paragraphs: ['Summa'] });
  });

  it('rewrites the VAT-free section heading to "Utlägg momsfri"', () => {
    const variant: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['VAT-free expenses', '', '', '', ''],
      ['2026-04-01', 'Domstolsavgift', '1', '900', ''],
      ['Total', '', '', '', ''],
    ];
    const state = computeUtlagg({ read: makeRead(variant), mileageKrPerKm: 25 });
    expect(state.patches).toContainEqual({ row: 1, col: 0, paragraphs: ['Utlägg momsfri'] });
    expect(state.patches).toContainEqual({ row: 3, col: 0, paragraphs: ['Summa'] });
  });

  it('leaves canonical Swedish labels unpatched', () => {
    const swedish: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['Utlägg', '', '', '', ''],
      ['2026-04-01', 'x', '1', '500', ''],
      ['Summa', '', '', '', ''],
    ];
    const state = computeUtlagg({ read: makeRead(swedish), mileageKrPerKm: 25 });
    const headingRewrite = state.patches.find(
      (p) => p.row === 1 && p.col === 0 && p.paragraphs.length > 0,
    );
    const summaryRewrite = state.patches.find(
      (p) => p.row === 3 && p.col === 0 && p.paragraphs.length > 0,
    );
    expect(headingRewrite).toBeUndefined();
    expect(summaryRewrite).toBeUndefined();
  });

  it('leaves uppercase Swedish labels unpatched (primary case-insensitive)', () => {
    const upper: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['UTLÄGG', '', '', '', ''],
      ['2026-04-01', 'x', '1', '500', ''],
      ['SUMMA', '', '', '', ''],
    ];
    const state = computeUtlagg({ read: makeRead(upper), mileageKrPerKm: 25 });
    const headingRewrite = state.patches.find(
      (p) => p.row === 1 && p.col === 0 && p.paragraphs.length > 0,
    );
    const summaryRewrite = state.patches.find(
      (p) => p.row === 3 && p.col === 0 && p.paragraphs.length > 0,
    );
    expect(headingRewrite).toBeUndefined();
    expect(summaryRewrite).toBeUndefined();
  });
});

describe('UtlaggProcessor — diagnostic warnings', () => {
  function makeRead(rows: readonly (readonly string[])[]): UtlaggRead {
    return {
      cells: rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
    };
  }

  it('warns when a recognized heading has no summary row', () => {
    const noSummary: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['Utlägg', '', '', '', ''],
      ['2026-04-01', 'x', '1', '500', ''],
      // missing Summa row
    ];
    const state = computeUtlagg({ read: makeRead(noSummary), mileageKrPerKm: 25 });
    expect(state.totalExMomsKr).toBe(0);
    expect(state.warnings.some((w) => w.includes('summaraden'))).toBe(true);
    expect(state.warnings.some((w) => w.includes('Utlägg'))).toBe(true);
  });

  it('warns when data rows exist but no recognized section heading is found', () => {
    const drifted: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['Övrigt', '', '', '', ''], // not a recognized section
      ['2026-04-01', 'x', '1', '500', ''],
      ['Summa', '', '', '', ''],
    ];
    const state = computeUtlagg({ read: makeRead(drifted), mileageKrPerKm: 25 });
    expect(state.totalExMomsKr).toBe(0);
    expect(state.totalEjMomsKr).toBe(0);
    expect(state.warnings.some((w) => w.includes('ingen sektionsrubrik hittades'))).toBe(true);
  });

  it('does NOT warn when the table is genuinely empty', () => {
    const empty: readonly (readonly string[])[] = [['Datum', 'Beskr', 'Antal', 'á', 'Belopp']];
    const state = computeUtlagg({ read: makeRead(empty), mileageKrPerKm: 25 });
    expect(state.warnings).toEqual([]);
  });

  it('does NOT warn when only the optional VAT-free section is absent', () => {
    const onlyVat: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['Utlägg', '', '', '', ''],
      ['2026-04-01', 'x', '1', '500', ''],
      ['Summa', '', '', '', ''],
    ];
    const state = computeUtlagg({ read: makeRead(onlyVat), mileageKrPerKm: 25 });
    expect(state.warnings).toEqual([]);
  });

  it('processor.transform copies state warnings into ctx.warnings', async () => {
    const drifted: readonly (readonly string[])[] = [
      ['Datum', 'Beskr', 'Antal', 'á', 'Belopp'],
      ['Övrigt', '', '', '', ''],
      ['2026-04-01', 'x', '1', '500', ''],
      ['Summa', '', '', '', ''],
    ];
    const range = new FakeTableKatsRange(
      drifted.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
    );
    const p = makeProcessor();
    const ctx = new KatsContext();
    await p.read(range, ctx);
    p.transform(ctx);
    expect(ctx.warnings.length).toBeGreaterThan(0);
    expect(ctx.warnings).toEqual(requireUtlaggState(ctx).warnings);
  });
});

describe('regression: Cecilia bug report 2026-05-02 (KATS-Debug-1.docx)', () => {
  // Verbatim shape of Cecilia's utlägg table: "Expenses" heading,
  // English-language "Total" summary, period decimal, mixed comma in
  // amount column. Pre-fix this returned totalExMomsKr = 0.
  const CECILIA_TABLE: readonly (readonly string[])[] = [
    ['Expenses', '', '', '', ''], // gridSpan-5 in the doc; equivalent here
    ['2026-04-30', 'Tolk 28/4-26', '1.00', '1597', ''],
    ['Total', '', '', '', ''],
  ];

  function makeRead(rows: readonly (readonly string[])[]): UtlaggRead {
    return {
      cells: rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
    };
  }

  it("computes totalExMomsKr = 1597 from Cecilia's English-labelled section", () => {
    const state = computeUtlagg({ read: makeRead(CECILIA_TABLE), mileageKrPerKm: 25 });
    expect(state.totalExMomsKr).toBe(1597);
  });

  it('emits no warnings for a fully-tolerated English template', () => {
    const state = computeUtlagg({ read: makeRead(CECILIA_TABLE), mileageKrPerKm: 25 });
    expect(state.warnings).toEqual([]);
  });

  it('writes the computed amount + Swedish-formatted summary back to the right cells', () => {
    const state = computeUtlagg({ read: makeRead(CECILIA_TABLE), mileageKrPerKm: 25 });
    const dataRow = 1;
    const summaryRow = 2;
    expect(state.patches).toContainEqual({
      row: dataRow,
      col: UTLAGG_COL.amount,
      paragraphs: ['1 597'],
    });
    expect(state.patches).toContainEqual({
      row: summaryRow,
      col: UTLAGG_COL.amount,
      paragraphs: ['1 597'],
    });
  });

  it('end-to-end pipeline: UTLAGG state surfaces totals for downstream ARVODE_TOTAL', async () => {
    const p = makeProcessor();
    const registry = new MapProcessorRegistry();
    registry.register(p);
    const ctx = new KatsContext();
    const range = table5(CECILIA_TABLE);
    const discoveries: Discovery[] = [{ tag: tagName('KATS_UTLAGGSSPECIFIKATION'), range }];
    await runPipeline(discoveries, registry, ctx);
    expect(getUtlaggTotalsFromContext(ctx)).toEqual({ exMomsKr: 1597, ejMomsKr: 0 });
    expect(ctx.warnings).toEqual([]);
  });
});

describe('UtlaggProcessor — render', () => {
  it('writes computed cells back to the table', async () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    const range = table5(STD_TABLE);
    await p.read(range, ctx);
    p.transform(ctx);
    await p.render(range, ctx);

    const snap = range.snapshot();
    // Row 2 amount cell
    expect(snap[2]?.[4]).toEqual(['550']);
    // Row 3 (mileage) — rate written by mileage rule, rendered Swedish-canonical
    expect(snap[3]?.[3]).toEqual(['25']);
    expect(snap[3]?.[4]).toEqual(['3 000']);
    // Row 4 summary
    expect(snap[4]?.[4]).toEqual(['3 550']);
    // Row 6 amount in VAT-free section
    expect(snap[6]?.[4]).toEqual(['900']);
    // Row 7 summary in VAT-free section
    expect(snap[7]?.[4]).toEqual(['900']);
  });

  it('throws if given a text range', async () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    const range = table5(STD_TABLE);
    await p.read(range, ctx);
    p.transform(ctx);
    await expect(p.render(new FakeTextKatsRange(), ctx)).rejects.toBeInstanceOf(ProcessorError);
  });
});

describe('UtlaggProcessor — context surface for downstream processors', () => {
  it('exposes totals via getUtlaggTotalsFromContext', async () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    const range = table5(STD_TABLE);
    await p.read(range, ctx);
    p.transform(ctx);
    expect(getUtlaggTotalsFromContext(ctx)).toEqual({ exMomsKr: 3550, ejMomsKr: 900 });
  });

  it('returns undefined when processor did not run', () => {
    expect(getUtlaggTotalsFromContext(new KatsContext())).toBeUndefined();
  });
});

describe('UtlaggProcessor — pipeline integration', () => {
  it('runs end-to-end inside runPipeline', async () => {
    const registry = new MapProcessorRegistry();
    registry.register(makeProcessor());
    const ctx = new KatsContext();
    const range = table5(STD_TABLE);
    const discoveries: Discovery[] = [{ tag: tagName('KATS_UTLAGGSSPECIFIKATION'), range }];
    await runPipeline(discoveries, registry, ctx);
    expect(getUtlaggTotalsFromContext(ctx)?.exMomsKr).toBe(3550);
  });
});
