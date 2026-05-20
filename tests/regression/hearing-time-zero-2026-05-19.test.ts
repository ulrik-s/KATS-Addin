/**
 * Regression: hearing-time elapsed calc gave 0,00 (2026-05-19).
 *
 * Symptom (user-reported):
 *   A row whose description contains "Medverkat vid förhandling från
 *   kl 09.00" rendered with `0,00` in the hours column instead of the
 *   actual elapsed time.
 *
 * Root cause:
 *   `captureHearingStart` built `start` from the row's date column
 *   (col 0). For docs drafted ahead of an upcoming hearing the row
 *   date was in the future; `elapsedMinutesClamped` did `+24*60` to
 *   wrap, but when `start - now > 24h` the wrap couldn't compensate
 *   and `diff` stayed negative → returned 0. Same path saturated at
 *   1440 for far-past row dates.
 *
 * Fix (PR #7, commit 5e1aa42):
 *   `start = TODAY at HH:MM` (NOW's calendar date — ignore col 0 for
 *   the time calc). `elapsedMinutesClamped` simplified to
 *   `max(0, min(1440, diff))` — no +24h wraparound.
 *
 * This file pins the cross-processor scenario end-to-end via
 * `runPipeline` so a future refactor of either the time helper or the
 * captureHearingStart logic cannot silently re-introduce 0,00.
 */
import { describe, expect, it } from 'vitest';
import { KatsContext } from '../../src/core/context.js';
import { tagName } from '../../src/core/processor.js';
import { type Discovery, MapProcessorRegistry, runPipeline } from '../../src/core/pipeline.js';
import { FakeTableKatsRange } from '../../src/io/fake-kats-table.js';
import {
  ArgrupperTiderProcessor,
  getCategoryHoursFromContext,
} from '../../src/processors/argrupper-tider/index.js';

const NOW = new Date(2026, 4, 19, 11, 30); // 2026-05-19 11:30 local

function table(rows: readonly (readonly string[])[]): FakeTableKatsRange {
  return new FakeTableKatsRange(
    rows.map((row) => row.map((cell) => (cell.length === 0 ? [] : [cell]))),
  );
}

describe('regression: hearing-time elapsed calc must not return 0,00 (2026-05-19)', () => {
  it('future row-date with hearing description renders the elapsed time, not 0,00', async () => {
    // Drafting a kostnadsräkning for an upcoming hearing — col 0 has
    // a future ISO date, description has "kl 09.00".
    const futureDate: readonly (readonly string[])[] = [
      ['Datum', 'Beskrivning', 'Antal', 'Belopp'],
      ['Arvode', '', '', ''],
      ['2026-06-15', 'Medverkat vid förhandling från kl 09.00', '', ''],
      ['Summa', '', '', ''],
    ];
    const registry = new MapProcessorRegistry();
    registry.register(new ArgrupperTiderProcessor({ now: () => NOW }));
    const ctx = new KatsContext();
    const range = table(futureDate);
    const discoveries: Discovery[] = [
      { tag: tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'), range },
    ];
    await runPipeline(discoveries, registry, ctx);

    const snap = range.snapshot();
    const hoursCell = snap[2]?.[2]?.join('') ?? '';
    // From today 09:00 to today 11:30 = 2.5 hours.
    expect(hoursCell).toBe('2,50');
    expect(hoursCell).not.toBe('0,00');
    expect(getCategoryHoursFromContext(ctx)?.arvode).toBe(2.5);
  });

  it('past row-date with hearing description still computes today-elapsed, not 24,00', async () => {
    // Same scenario but col 0 is far in the past.
    const pastDate: readonly (readonly string[])[] = [
      ['Datum', 'Beskrivning', 'Antal', 'Belopp'],
      ['Arvode', '', '', ''],
      ['2025-12-01', 'Medverkat vid förhandling från kl 09.00', '', ''],
      ['Summa', '', '', ''],
    ];
    const registry = new MapProcessorRegistry();
    registry.register(new ArgrupperTiderProcessor({ now: () => NOW }));
    const ctx = new KatsContext();
    const range = table(pastDate);
    await runPipeline(
      [{ tag: tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'), range }],
      registry,
      ctx,
    );

    const snap = range.snapshot();
    const hoursCell = snap[2]?.[2]?.join('') ?? '';
    expect(hoursCell).toBe('2,50');
    expect(hoursCell).not.toBe('24,00');
  });

  it('NOW before hearing start today leaves cell empty (and warns)', async () => {
    // User opens the doc at 08:00 — hearing is at 09:00 same day.
    // The cell should stay empty (no auto-fill of "0,00") and the
    // 0-hour warning should surface.
    const morningNow = new Date(2026, 4, 19, 8, 0);
    const sameDay: readonly (readonly string[])[] = [
      ['Datum', 'Beskrivning', 'Antal', 'Belopp'],
      ['Arvode', '', '', ''],
      ['2026-05-19', 'Medverkat vid förhandling från kl 09.00', '', ''],
      ['Summa', '', '', ''],
    ];
    const registry = new MapProcessorRegistry();
    registry.register(new ArgrupperTiderProcessor({ now: () => morningNow }));
    const ctx = new KatsContext();
    const range = table(sameDay);
    await runPipeline(
      [{ tag: tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'), range }],
      registry,
      ctx,
    );

    const snap = range.snapshot();
    const hoursCell = snap[2]?.[2]?.join('') ?? '';
    expect(hoursCell).not.toBe('0,00');
    expect(ctx.warnings.some((w) => w.includes('2026-05-19'))).toBe(true);
  });
});
