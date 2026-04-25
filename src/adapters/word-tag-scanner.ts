import { TagScanError } from '../core/errors.js';
import { type TagName } from '../core/processor.js';
import { type Discovery } from '../core/pipeline.js';
import { type KatsRange } from '../io/kats-range.js';
import { WordTableKatsRange } from './word-table-range.js';
import { WordTextKatsRange } from './word-text-range.js';

/**
 * Discover every `[[<TAG>_START]]…[[<TAG>_END]]` pair in the active
 * document body and yield Discoveries. Caller passes the list of known
 * tag names so the scanner only searches for tags we actually handle.
 *
 * Per-tag literal searches keep this simple and reliable. The earlier
 * approach (search for `[[KATS_` prefix, then `expandTo` /
 * `getNextTextRange` to capture the marker) was fragile — Word treats
 * `[[` and `]]` as non-word-boundary punctuation, so the expansion
 * primitives behaved unpredictably across docs.
 *
 * For each pair:
 *   1. Capture the inner range (between END of START-marker and START
 *      of END-marker).
 *   2. Probe `inner.tables` to classify as text or table range.
 *   3. Clear the marker text so processors see clean content.
 *
 * Marker stripping is deferred to a final phase so `clear()` doesn't
 * invalidate ranges still in use.
 */
export async function discoverKatsTags(
  body: Word.Body,
  knownTags: readonly TagName[],
): Promise<readonly Discovery[]> {
  const ctx = body.context;

  // Phase 1 — for each known tag, kick off START + END searches.
  interface TagSearch {
    readonly tag: TagName;
    readonly starts: Word.RangeCollection;
    readonly ends: Word.RangeCollection;
  }
  const searches: TagSearch[] = knownTags.map((tag) => {
    const starts = body.search(`[[${tag as unknown as string}_START]]`, {
      matchCase: true,
      matchWildcards: false,
    });
    const ends = body.search(`[[${tag as unknown as string}_END]]`, {
      matchCase: true,
      matchWildcards: false,
    });
    starts.load('items');
    ends.load('items');
    return { tag, starts, ends };
  });
  await ctx.sync();

  // Phase 2 — pair START with END for each tag and capture inner range.
  interface DiscoveryDraft {
    readonly tag: TagName;
    readonly inner: Word.Range;
    readonly start: Word.Range;
    readonly end: Word.Range;
    readonly tables: Word.TableCollection;
  }
  const drafts: DiscoveryDraft[] = [];
  for (const { tag, starts, ends } of searches) {
    if (starts.items.length === 0 && ends.items.length === 0) continue;
    if (starts.items.length !== ends.items.length) {
      throw new TagScanError(
        `unbalanced ${tag as unknown as string}: ${String(starts.items.length)} START vs ${String(
          ends.items.length,
        )} END markers`,
      );
    }
    for (let i = 0; i < starts.items.length; i += 1) {
      const start = starts.items[i];
      const end = ends.items[i];
      if (!start || !end) continue;
      const inner = start
        .getRange(Word.RangeLocation.end)
        .expandTo(end.getRange(Word.RangeLocation.start));
      const tables = inner.tables;
      tables.load('items');
      drafts.push({ tag, inner, start, end, tables });
    }
  }
  await ctx.sync();

  // Phase 3 — for table-shaped pairs, also load table dimensions.
  for (const d of drafts) {
    if (d.tables.items.length !== 1) continue;
    const t = d.tables.items[0];
    if (t) t.load('rowCount, values');
  }
  await ctx.sync();

  // Phase 4 — build KatsRange objects + collect Discoveries.
  const discoveries: Discovery[] = [];
  for (const d of drafts) {
    let range: KatsRange;
    if (d.tables.items.length === 1) {
      const t = d.tables.items[0];
      if (!t) {
        throw new TagScanError(
          `internal: tables.items[0] missing for ${d.tag as unknown as string}`,
        );
      }
      // Heading rows in KATS templates are typically a single merged cell
      // spanning all columns. `values[0].length` would then be 1 even
      // though the data rows have e.g. 5 cells. Take the max across rows
      // to get the table's logical column count.
      const columnCount = t.values.reduce((max, row) => (row.length > max ? row.length : max), 0);
      // Defensive copy so external table mutations don't poison our cache.
      const cachedValues = t.values.map((row) => [...row]);
      range = new WordTableKatsRange(t, t.rowCount, columnCount, cachedValues);
    } else {
      range = new WordTextKatsRange(d.inner);
    }
    discoveries.push({ tag: d.tag, range });
  }

  // Phase 5 — strip marker text so processors see clean inner content.
  for (const d of drafts) {
    d.start.clear();
    d.end.clear();
  }
  await ctx.sync();

  return discoveries;
}
