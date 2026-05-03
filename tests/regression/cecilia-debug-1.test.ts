/**
 * Regression: Cecilia bug report 2026-05-02 (KATS-Debug-1.docx).
 *
 * Original symptom: a kostnadsräkning whose ARGRUPPER and UTLAGG tables
 * had English-translated headings ("Fee", "Total", "Case, total",
 * "Expenses") rendered with 0 timmar in ARVODE despite the
 * specification listing 5,50 hours of work + 0,50 tidsspillan + 1 597
 * kr utlägg.
 *
 * Root cause: the section/summary matchers required exact Swedish
 * labels.
 *
 * Fix: alias-aware label matching plus user-facing diagnostics for
 * residual drift (see swedish-text.ts LabelSpec, KatsContext.warnings).
 *
 * This file pins the cross-processor chain end-to-end so a future
 * label/matcher refactor can't silently re-introduce the bug.
 */
import { describe, it, expect } from 'vitest';
import { KatsContext } from '../../src/core/context.js';
import { tagName } from '../../src/core/processor.js';
import { type Discovery, MapProcessorRegistry, runPipeline } from '../../src/core/pipeline.js';
import { type KatsUser } from '../../src/domain/user-db.js';
import { FakeTableKatsRange } from '../../src/io/fake-kats-table.js';
import {
  ArgrupperTiderProcessor,
  getCategoryHoursFromContext,
} from '../../src/processors/argrupper-tider/index.js';
import { ArvodeProcessor, getArvodeExMomsFromContext } from '../../src/processors/arvode/index.js';
import { UtlaggProcessor, getUtlaggTotalsFromContext } from '../../src/processors/utlagg/index.js';

const NOW = new Date(2026, 4, 2, 9, 22); // 2026-05-02 09:22 — moment Cecilia generated the doc

const CECILIA: KatsUser = {
  key: 'cecilia',
  shortName: 'Cecilia',
  fullName: 'Cecilia Moll',
  mileageKrPerKm: 25,
  title: 'Advokat',
  city: 'Lund',
  aliases: [],
};

/** Verbatim shape of the bug-report doc's ARGRUPPER table. */
const CECILIA_ARGRUPPER: readonly (readonly string[])[] = [
  ['Fee', '', ''],
  ['2026-02-03', 'Ankom förordnande, inledande åtgärder.', '0.75'],
  ['2026-03-05', 'Telefon till utredare.', '0.10'],
  ['2026-04-15', 'Ankom mail fr utredare.', '0.10'],
  ['2026-04-21', 'Medverkat vid förhör.', '2.10'],
  ['2026-04-21', 'Telefonsamtal genom dottern.', '0.25'],
  ['2026-04-22', 'Mottagit mail från utredaren.', '0.20'],
  ['2026-04-23', 'Telefonsamtal med utredaren.', '0.10'],
  ['2026-04-28', 'Möte med huvudman.', '1.40'],
  ['2026-04-30', 'Ankom nedläggningsbeslut.', '0.50'],
  ['Total', '', '5.50'],
  ['Tidsspillan', '', ''],
  ['2026-04-21', 'Spilltid i samband med inställelse.', '0.50'],
  ['Total', '', '0.50'],
  ['Case, total', '', '6.00'],
  ['', '', ''],
];

/** Cecilia's UTLAGG table — only an "Expenses" section, single row. */
const CECILIA_UTLAGG: readonly (readonly string[])[] = [
  ['Expenses', '', '', '', ''],
  ['2026-04-30', 'Tolk 28/4-26', '1.00', '1597', ''],
  ['Total', '', '', '', ''],
];

/** Cecilia's ARVODE table layout — 6 rows incl. header + 5 categories + utlägg. */
const CECILIA_ARVODE: readonly (readonly [string, string, string])[] = [
  ['', '', ''],
  ['ARVODE', ' á 1626 kr', ' kr'],
  ['ARVODE HELG', ' á 3256 kr', ' kr'],
  ['TIDSSPILLAN', ' á 1487 kr', ' kr'],
  ['TIDSSPILLAN ÖVRIG TID', ' á 975 kr', ' kr'],
  ['UTLÄGG', '', ''],
];

function table(rows: readonly (readonly string[])[]): FakeTableKatsRange {
  return new FakeTableKatsRange(
    rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
  );
}

describe('cross-processor regression: Cecilia bug report 2026-05-02', () => {
  it('UTLAGG → ARGRUPPER → ARVODE chain produces non-zero arvode (the symptom that was 0)', async () => {
    const registry = new MapProcessorRegistry();
    registry.register(new UtlaggProcessor({ getCurrentUser: () => CECILIA }));
    registry.register(new ArgrupperTiderProcessor({ now: () => NOW }));
    registry.register(new ArvodeProcessor());

    const utlaggRange = table(CECILIA_UTLAGG);
    const argrupperRange = table(CECILIA_ARGRUPPER);
    const arvodeRange = table(CECILIA_ARVODE);

    const ctx = new KatsContext();
    const discoveries: Discovery[] = [
      { tag: tagName('KATS_UTLAGGSSPECIFIKATION'), range: utlaggRange },
      { tag: tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'), range: argrupperRange },
      { tag: tagName('KATS_ARVODE'), range: arvodeRange },
    ];
    await runPipeline(discoveries, registry, ctx);

    // ARGRUPPER cross-processor surface must report the actual hours.
    expect(getCategoryHoursFromContext(ctx)).toEqual({
      arvode: 5.5,
      arvodeHelg: 0,
      tidsspillan: 0.5,
      tidsspillanOvrigTid: 0,
    });

    // ARVODE total must be > 0 — the user-visible bug was that this was 0.
    const arvodeTotal = getArvodeExMomsFromContext(ctx);
    expect(arvodeTotal).toBeGreaterThan(0);

    // Sanity-check the math: 5.50 × 1626 + 0.50 × 1487 + 1597 utlägg,
    // per-row rounding (legacy/court default) → whole kronor per row.
    // The 1597 flows from UTLAGG → ARVODE via cross-processor context;
    // the ARVODE table's UTLÄGG row is empty in this snapshot but the
    // amount is still pulled from UTLAGG's totalExMomsKr.
    const expectedArvode = Math.round(5.5 * 1626); // 8943
    const expectedTids = Math.round(0.5 * 1487); // 744 (743.5 rounded up)
    const expectedUtlagg = 1597;
    expect(arvodeTotal).toBe(expectedArvode + expectedTids + expectedUtlagg);

    // UTLAGG totals must surface for downstream ARVODE_TOTAL.
    expect(getUtlaggTotalsFromContext(ctx)).toEqual({ exMomsKr: 1597, ejMomsKr: 0 });

    // And after fixing the bug, no warnings should appear for this doc.
    expect(ctx.warnings).toEqual([]);
  });

  it('renders ARVODE rows with the correct Swedish-formatted amounts', async () => {
    const registry = new MapProcessorRegistry();
    registry.register(new UtlaggProcessor({ getCurrentUser: () => CECILIA }));
    registry.register(new ArgrupperTiderProcessor({ now: () => NOW }));
    registry.register(new ArvodeProcessor());

    const arvodeRange = table(CECILIA_ARVODE);
    const ctx = new KatsContext();
    const discoveries: Discovery[] = [
      { tag: tagName('KATS_UTLAGGSSPECIFIKATION'), range: table(CECILIA_UTLAGG) },
      { tag: tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'), range: table(CECILIA_ARGRUPPER) },
      { tag: tagName('KATS_ARVODE'), range: arvodeRange },
    ];
    await runPipeline(discoveries, registry, ctx);

    const snap = arvodeRange.snapshot();
    // After ARVODE deletes zero-amount rows (helg + övrig tid), the
    // remaining rows include the rendered ARVODE + TIDSSPILLAN amounts.
    const flat = snap.flat(2).join('|');
    expect(flat).toContain('8 943,00 kr'); // 5.50 × 1626 = 8943
    expect(flat).toContain('744,00 kr'); // 0.50 × 1487 = 743.50 → per-row rounding lifts to 744
  });

  it('clears the ARVODE UTLÄGG row spec col and writes the canonical amount from UTLAGG', async () => {
    // The user's complaint: the ARVODE table's UTLÄGG row showed
    // "1.00" antal alongside the kr amount. After the fix, only the
    // canonical kr amount is written and spec is cleared.
    const registry = new MapProcessorRegistry();
    registry.register(new UtlaggProcessor({ getCurrentUser: () => CECILIA }));
    registry.register(new ArgrupperTiderProcessor({ now: () => NOW }));
    registry.register(new ArvodeProcessor());

    const arvodeWithStaleAntal: readonly (readonly [string, string, string])[] = [
      ['', '', ''],
      ['ARVODE', ' á 1626 kr', ' kr'],
      ['ARVODE HELG', ' á 3256 kr', ' kr'],
      ['TIDSSPILLAN', ' á 1487 kr', ' kr'],
      ['TIDSSPILLAN ÖVRIG TID', ' á 975 kr', ' kr'],
      ['UTLÄGG', '1.00', ' 1,597.00 kr'], // ← Cecilia's manual antal+amt
    ];
    const arvodeRange = table(arvodeWithStaleAntal);

    const ctx = new KatsContext();
    const discoveries: Discovery[] = [
      { tag: tagName('KATS_UTLAGGSSPECIFIKATION'), range: table(CECILIA_UTLAGG) },
      { tag: tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'), range: table(CECILIA_ARGRUPPER) },
      { tag: tagName('KATS_ARVODE'), range: arvodeRange },
    ];
    await runPipeline(discoveries, registry, ctx);

    const snap = arvodeRange.snapshot();
    // Locate the UTLÄGG row in the post-render snapshot.
    const utlaggRow = snap.find((row) => (row[0] ?? []).join('').includes('UTL'));
    expect(utlaggRow).toBeDefined();
    // Spec col 1 should be empty (cleared); amount col 2 should be the
    // formatted utlägg total from UTLAGG (1597 kr).
    expect((utlaggRow ?? [])[1]).toEqual([]);
    expect((utlaggRow ?? [])[2]?.join('')).toBe('1 597,00 kr');
  });

  it('parses English-formatted utlägg amount "1,597.00 kr" correctly (last separator wins)', async () => {
    // The ARVODE-table's UTLÄGG row in Cecilia's actual doc was
    // manually filled by her with " 1,597.00 kr" (English format with
    // comma-thousands and dot-decimal). Pre-fix svToNumber treated the
    // first separator as decimal, parsing it as 1.597 → "Belopp exkl.
    // moms" came out 1595 kr too low.
    const registry = new MapProcessorRegistry();
    registry.register(new UtlaggProcessor({ getCurrentUser: () => CECILIA }));
    registry.register(new ArgrupperTiderProcessor({ now: () => NOW }));
    registry.register(new ArvodeProcessor());

    const ARVODE_WITH_ENGLISH_UTLAGG: readonly (readonly [string, string, string])[] = [
      ['', '', ''],
      ['ARVODE', ' á 1626 kr', ' kr'],
      ['ARVODE HELG', ' á 3256 kr', ' kr'],
      ['TIDSSPILLAN', ' á 1487 kr', ' kr'],
      ['TIDSSPILLAN ÖVRIG TID', ' á 975 kr', ' kr'],
      ['UTLÄGG', '1.00', ' 1,597.00 kr'], // ← Cecilia's manually-entered English format
    ];

    const ctx = new KatsContext();
    const discoveries: Discovery[] = [
      { tag: tagName('KATS_UTLAGGSSPECIFIKATION'), range: table(CECILIA_UTLAGG) },
      { tag: tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'), range: table(CECILIA_ARGRUPPER) },
      { tag: tagName('KATS_ARVODE'), range: table(ARVODE_WITH_ENGLISH_UTLAGG) },
    ];
    await runPipeline(discoveries, registry, ctx);

    // Total ex moms = 5.50 × 1626 + 0.50 × 1487 + 1597 = 8943 + 744 + 1597 = 11284.
    expect(getArvodeExMomsFromContext(ctx)).toBe(8943 + 744 + 1597);
  });

  it("renders all numeric cells in Swedish format (',' decimal, ' ' thousand)", async () => {
    // The user complained that the rendered tables had a mix of
    // English ("0.75", "1,597") and Swedish ("0,50") notation. Pin
    // here that every numeric cell ends up Swedish-canonical.
    const registry = new MapProcessorRegistry();
    registry.register(new UtlaggProcessor({ getCurrentUser: () => CECILIA }));
    registry.register(new ArgrupperTiderProcessor({ now: () => NOW }));
    registry.register(new ArvodeProcessor());

    const argrupperRange = table(CECILIA_ARGRUPPER);
    const utlaggRange = table(CECILIA_UTLAGG);
    const arvodeRange = table(CECILIA_ARVODE);
    const ctx = new KatsContext();
    const discoveries: Discovery[] = [
      { tag: tagName('KATS_UTLAGGSSPECIFIKATION'), range: utlaggRange },
      { tag: tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'), range: argrupperRange },
      { tag: tagName('KATS_ARVODE'), range: arvodeRange },
    ];
    await runPipeline(discoveries, registry, ctx);

    // ARGRUPPER hours column: every Cecilia entry was "0.75" / "0.10"
    // / etc — must come out as "0,75" / "0,10".
    const argSnap = argrupperRange.snapshot();
    const argHourCells = argSnap.map((row) => row[2]?.join('') ?? '');
    for (const cell of argHourCells) {
      expect(cell).not.toMatch(/\d\.\d/); // no period decimal anywhere
    }
    // Spot-check specific values.
    expect(argHourCells).toContain('0,75');
    expect(argHourCells).toContain('2,10');
    expect(argHourCells).toContain('5,50'); // section sum
    expect(argHourCells).toContain('0,50'); // tidsspillan section sum

    // UTLAGG: "1.00" qty becomes "1", "1,597" rate becomes "1 597",
    // and the amount/total uses thousand-space ("1 597").
    const utlaggSnap = utlaggRange.snapshot();
    const utlaggFlat = utlaggSnap.flat(2).join('|');
    expect(utlaggFlat).toContain('1 597'); // thousand-space rate + total
    expect(utlaggFlat).not.toMatch(/1\.0[0-9]/); // no English "1.00" qty
    expect(utlaggFlat).not.toMatch(/1,5\d\d(?!\d)/); // no comma-thousand "1,597"

    // ARVODE: UTLÄGG row writes "1 597,00 kr" via formatSvMoney.
    const arvSnap = arvodeRange.snapshot();
    const arvFlat = arvSnap.flat(2).join('|');
    expect(arvFlat).toContain('1 597,00 kr');
  });

  it('writes Swedish back over English labels in ARGRUPPER + UTLÄGG tables', async () => {
    // The user-visible follow-up bug: matching English aliases worked,
    // but the rendered doc still showed "Fee" / "Total" / "Expenses".
    // Now the post-render snapshot must be monolingual Swedish.
    const registry = new MapProcessorRegistry();
    registry.register(new UtlaggProcessor({ getCurrentUser: () => CECILIA }));
    registry.register(new ArgrupperTiderProcessor({ now: () => NOW }));

    const argrupperRange = table(CECILIA_ARGRUPPER);
    const utlaggRange = table(CECILIA_UTLAGG);
    const ctx = new KatsContext();
    const discoveries: Discovery[] = [
      { tag: tagName('KATS_UTLAGGSSPECIFIKATION'), range: utlaggRange },
      { tag: tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'), range: argrupperRange },
    ];
    await runPipeline(discoveries, registry, ctx);

    const argrupperFlat = argrupperRange.snapshot().flat(2).join('|');
    expect(argrupperFlat).toContain('Arvode'); // rewritten from "Fee"
    expect(argrupperFlat).toContain('Summa'); // rewritten from "Total"
    expect(argrupperFlat).toContain('Tidsspillan'); // already Swedish, untouched
    expect(argrupperFlat).not.toContain('Fee');
    // "Total" appears as a substring of "totalt" etc; check the cell-exact form.
    const argRows = argrupperRange.snapshot();
    const cellTexts = argRows.map((r) => r.map((c) => c.join('\r')));
    const exactTotalCells = cellTexts.flat().filter((t) => t.trim() === 'Total');
    expect(exactTotalCells).toEqual([]);

    const utlaggFlat = utlaggRange.snapshot().flat(2).join('|');
    expect(utlaggFlat).toContain('Utlägg'); // rewritten from "Expenses"
    expect(utlaggFlat).toContain('Summa'); // rewritten from "Total"
    expect(utlaggFlat).not.toContain('Expenses');
  });
});
