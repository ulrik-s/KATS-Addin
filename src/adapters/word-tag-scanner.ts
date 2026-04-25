import { TagScanError } from '../core/errors.js';
import { tagName } from '../core/processor.js';
import { type Discovery } from '../core/pipeline.js';
import { type KatsRange } from '../io/kats-range.js';
import { WordTableKatsRange } from './word-table-range.js';
import { WordTextKatsRange } from './word-text-range.js';

/**
 * Discover every `[[KATS_<NAME>_START]]…[[KATS_<NAME>_END]]` pair in
 * the active document body, classify the wrapped content as text or
 * table, and yield Discovery entries the pipeline can consume.
 *
 * Implementation:
 *   1. Search the body for the literal `[[KATS_` prefix to find every
 *      START candidate. Searching for the unconstrained prefix once
 *      is cheaper than running 16 separate searches per known tag.
 *   2. For each START hit, parse its text to extract the tag name and
 *      role (`START`/`END`).
 *   3. Pair STARTs with the matching END marker that follows.
 *   4. For each pair, expand a Word.Range from the END of START to the
 *      START of END to capture the content. Inspect contained tables
 *      to choose between Word{Text,Table}KatsRange.
 *   5. Delete the marker text so processors see clean content.
 */
export async function discoverKatsTags(body: Word.Body): Promise<readonly Discovery[]> {
  const ctx = body.context;
  const matches = body.search('[[KATS_', {
    matchCase: true,
    matchPrefix: true,
    matchWildcards: false,
  });
  matches.load('items/text');
  await ctx.sync();

  // Each search hit is the prefix only. Expand each to the full
  // marker text by extending the range to include the closing `]]`.
  const fullMarkers: { range: Word.Range; text: string }[] = [];
  for (const m of matches.items) {
    const expanded = m.expandTo(m.getRange(Word.RangeLocation.end).getNextTextRange([']]'], false));
    expanded.load('text');
    fullMarkers.push({ range: expanded, text: '' });
  }
  await ctx.sync();
  for (const m of fullMarkers) {
    m.text = m.range.text;
  }

  const parsed = fullMarkers
    .map((m) => parseMarker(m.text, m.range))
    .filter((x): x is ParsedMarker => x !== undefined);

  const pairs = pairMarkers(parsed);

  const discoveries: Discovery[] = [];
  for (const pair of pairs) {
    // Capture the inner range BEFORE deleting markers — once deleted,
    // the original ranges may dangle.
    const inner = pair.startMarker.range
      .getRange(Word.RangeLocation.end)
      .expandTo(pair.endMarker.range.getRange(Word.RangeLocation.start));
    inner.load('text');
    const tables = inner.tables;
    tables.load('items');
    await ctx.sync();

    let katsRange: KatsRange;
    if (tables.items.length === 1) {
      const t = tables.items[0];
      if (!t) throw new TagScanError(`internal: tables.items[0] missing for ${pair.name}`);
      t.load('rowCount, values');
      await ctx.sync();
      const rowCount = t.rowCount;
      const columnCount = t.values[0]?.length ?? 0;
      katsRange = new WordTableKatsRange(t, rowCount, columnCount);
    } else {
      katsRange = new WordTextKatsRange(inner);
    }

    discoveries.push({
      tag: tagName(`KATS_${pair.name}`),
      range: katsRange,
    });

    // Strip the marker text so processors see only the inner content.
    pair.startMarker.range.clear();
    pair.endMarker.range.clear();
  }
  await ctx.sync();

  return discoveries;
}

interface ParsedMarker {
  readonly name: string;
  readonly role: 'START' | 'END';
  readonly range: Word.Range;
}

const MARKER_PATTERN = /\[\[KATS_([A-Z_]+)_(START|END)\]\]/;

function parseMarker(text: string, range: Word.Range): ParsedMarker | undefined {
  const m = MARKER_PATTERN.exec(text.trim());
  if (!m) return undefined;
  const name = m[1];
  const role = m[2];
  if (name === undefined) return undefined;
  if (role !== 'START' && role !== 'END') return undefined;
  return { name, role, range };
}

interface MarkerPair {
  readonly name: string;
  readonly startMarker: ParsedMarker;
  readonly endMarker: ParsedMarker;
}

function pairMarkers(markers: readonly ParsedMarker[]): MarkerPair[] {
  const open = new Map<string, ParsedMarker>();
  const stack: string[] = [];
  const pairs: MarkerPair[] = [];

  for (const m of markers) {
    if (m.role === 'START') {
      if (open.has(m.name)) {
        throw new TagScanError(`duplicate start tag KATS_${m.name}_START`);
      }
      open.set(m.name, m);
      stack.push(m.name);
      continue;
    }
    const start = open.get(m.name);
    if (!start) {
      throw new TagScanError(`end tag KATS_${m.name}_END has no matching start`);
    }
    const top = stack[stack.length - 1];
    if (top !== m.name) {
      throw new TagScanError(
        `overlapping tags: KATS_${m.name}_END closes while KATS_${top ?? '?'} is still open`,
      );
    }
    pairs.push({ name: m.name, startMarker: start, endMarker: m });
    open.delete(m.name);
    stack.pop();
  }

  if (open.size > 0) {
    throw new TagScanError(`unclosed tags: ${[...open.keys()].map((n) => `KATS_${n}`).join(', ')}`);
  }
  return pairs;
}
