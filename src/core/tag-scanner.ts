import { TagScanError } from './errors.js';
import { type TagName, tagName } from './processor.js';

/** A paired `[[KATS_NAME_START]]` … `[[KATS_NAME_END]]` occurrence in a document. */
export interface TagMatch {
  /** Validated full tag name, e.g. "KATS_UTLAGGSSPECIFIKATION". */
  readonly tag: TagName;
  /** Short form without KATS_ prefix, e.g. "UTLAGGSSPECIFIKATION". */
  readonly name: string;
  /** Index of `[[` in the START marker. */
  readonly startIndex: number;
  /** Index immediately after `]]` in the END marker. */
  readonly endIndex: number;
  /** Index immediately after `]]` of the START marker (first char of content). */
  readonly contentStart: number;
  /** Index of `[[` in the END marker (one past last char of content). */
  readonly contentEnd: number;
}

const TAG_PATTERN = /\[\[KATS_([A-Z_]+)_(START|END)\]\]/g;

interface RawMarker {
  readonly name: string;
  readonly kind: 'START' | 'END';
  readonly startIndex: number;
  readonly endIndex: number;
}

function collectMarkers(text: string): RawMarker[] {
  const markers: RawMarker[] = [];
  for (const m of text.matchAll(TAG_PATTERN)) {
    const name = m[1];
    const kind = m[2];
    if (name === undefined || kind === undefined) continue;
    if (kind !== 'START' && kind !== 'END') continue;
    markers.push({
      name,
      kind,
      startIndex: m.index,
      endIndex: m.index + m[0].length,
    });
  }
  return markers;
}

/**
 * Scan text for paired KATS tags.
 *
 * Rules enforced:
 * - Every START must be followed by a matching END before another START of
 *   the same name appears (no nesting of the same tag).
 * - Every START must have an END.
 * - Every END must have a preceding START.
 * - Different tags may not overlap: `[[KATS_A_START]] [[KATS_B_START]]
 *   [[KATS_A_END]] [[KATS_B_END]]` is rejected.
 *
 * Throws `TagScanError` on any violation.
 */
export function scanTags(text: string): TagMatch[] {
  const markers = collectMarkers(text);
  const open = new Map<string, RawMarker>();
  const openStack: string[] = [];
  const matches: TagMatch[] = [];

  for (const marker of markers) {
    if (marker.kind === 'START') {
      if (open.has(marker.name)) {
        throw new TagScanError(
          `Duplicate or nested start tag KATS_${marker.name}_START at index ${String(marker.startIndex)}`,
        );
      }
      open.set(marker.name, marker);
      openStack.push(marker.name);
      continue;
    }

    // END
    const start = open.get(marker.name);
    if (!start) {
      throw new TagScanError(
        `End tag KATS_${marker.name}_END at index ${String(marker.startIndex)} has no matching start`,
      );
    }

    const topOfStack = openStack[openStack.length - 1];
    if (topOfStack !== marker.name) {
      throw new TagScanError(
        `Overlapping tags: KATS_${marker.name}_END closes while KATS_${topOfStack ?? '?'} is still open`,
      );
    }

    matches.push({
      tag: tagName(`KATS_${marker.name}`),
      name: marker.name,
      startIndex: start.startIndex,
      endIndex: marker.endIndex,
      contentStart: start.endIndex,
      contentEnd: marker.startIndex,
    });
    open.delete(marker.name);
    openStack.pop();
  }

  if (open.size > 0) {
    const names = [...open.keys()].map((n) => `KATS_${n}`).join(', ');
    throw new TagScanError(`Unclosed tags: ${names}`);
  }

  return matches;
}
