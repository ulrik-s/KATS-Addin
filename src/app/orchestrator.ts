import { KatsContext } from '../core/context.js';
import { tagName, type Processor, type TagName } from '../core/processor.js';
import { type Discovery, MapProcessorRegistry, runPipeline } from '../core/pipeline.js';
import { ArgrupperTiderProcessor } from '../processors/argrupper-tider/index.js';
import { ArvodeProcessor } from '../processors/arvode/index.js';
import { ArvodeTotalProcessor } from '../processors/arvode-total/index.js';
import { MottagareProcessor } from '../processors/mottagare/index.js';
import { SignaturProcessor } from '../processors/signatur/index.js';
import { UtlaggProcessor } from '../processors/utlagg/index.js';
import { YttrandeParterProcessor } from '../processors/yttrande-parter/index.js';
import { YttrandeSignaturProcessor } from '../processors/yttrande-signatur/index.js';
import { WordKatsDocument } from '../adapters/word-document.js';
import { discoverKatsTags } from '../adapters/word-tag-scanner.js';
import { getCurrentUser } from './current-user.js';
import { normalizeHeadersAndFooters } from './headers-footers/normalize.js';
import { getHourlyRateOverride, getRoundingMode } from './settings.js';

export interface RunResult {
  readonly tagsProcessed: number;
}

/**
 * Dependency-ordered list of processors. Discovery order in a Word doc
 * is arbitrary (drafters lay tags out by visual layout, not data
 * flow), but transform-time cross-processor reads need upstream state.
 *
 * Order constraints encoded here:
 *   MOTTAGARE before SIGNATUR        (postort flows through ctx)
 *   UTLAGG  → ARGRUPPER → ARVODE → ARVODE_TOTAL    (economics chain)
 *   YTTRANDE_PARTER before YTTRANDE_SIGNATUR  (party data informs sig)
 */
const PROCESSING_ORDER: readonly TagName[] = [
  tagName('KATS_MOTTAGARE'),
  tagName('KATS_UTLAGGSSPECIFIKATION'),
  tagName('KATS_ARGRUPPERTIDERDATUMANTALSUMMA'),
  tagName('KATS_ARVODE'),
  tagName('KATS_ARVODE_TOTAL'),
  tagName('KATS_YTTRANDE_PARTER'),
  tagName('KATS_YTTRANDE_SIGNATUR'),
  tagName('KATS_SIGNATUR'),
];

/**
 * Build the registry of all eight KATS processors with their
 * runtime dependencies.
 */
function buildRegistry(document: Word.Document): MapProcessorRegistry {
  const katsDocument = new WordKatsDocument(document.body);
  const now = (): Date => new Date();
  const user = (): ReturnType<typeof getCurrentUser> => getCurrentUser();

  const processors: Processor[] = [
    new MottagareProcessor(),
    new UtlaggProcessor({ getCurrentUser: user }),
    new ArgrupperTiderProcessor({ now }),
    new ArvodeProcessor({
      getRoundingMode,
      getHourlyRateOverrideKr: getHourlyRateOverride,
    }),
    new ArvodeTotalProcessor(),
    new SignaturProcessor({ now, getCurrentUser: user }),
    new YttrandeSignaturProcessor({ now, getCurrentUser: user }),
    new YttrandeParterProcessor({ document: katsDocument }),
  ];

  const registry = new MapProcessorRegistry();
  for (const p of processors) registry.register(p);
  return registry;
}

/**
 * Sort a discovery list into the canonical processing order. Tags not
 * present in the doc are dropped; tags present multiple times are kept
 * in their relative document order within their slot.
 */
function orderDiscoveries(discoveries: readonly Discovery[]): Discovery[] {
  const byTag = new Map<TagName, Discovery[]>();
  for (const d of discoveries) {
    const list = byTag.get(d.tag) ?? [];
    list.push(d);
    byTag.set(d.tag, list);
  }
  const ordered: Discovery[] = [];
  for (const tag of PROCESSING_ORDER) {
    const list = byTag.get(tag);
    if (!list) continue;
    ordered.push(...list);
    byTag.delete(tag);
  }
  // Any tags that didn't match the order list (shouldn't happen in
  // practice but covers future unknown tags) trail the ordered list.
  for (const list of byTag.values()) ordered.push(...list);
  return ordered;
}

/**
 * Discover and process every KATS tag in the active Word document.
 *
 * Single Word.run block so all reads, transforms, and renders share
 * one context — avoids the nested-context deadlocks the legacy VBA
 * port hit.
 */
export async function runOnActiveDocument(): Promise<RunResult> {
  return Word.run(async (context) => {
    // Normalize headers/footers first — runs unconditionally on every
    // KATS-processed document, even ones without any tags. Doing it
    // before tag scanning means the canonical h/f are in place before
    // processors potentially rely on document layout.
    await normalizeHeadersAndFooters(context.document);

    const body = context.document.body;
    const discoveries = await discoverKatsTags(body, PROCESSING_ORDER);

    if (discoveries.length === 0) {
      return { tagsProcessed: 0 };
    }

    const registry = buildRegistry(context.document);
    const ctx = new KatsContext();
    const ordered = orderDiscoveries(discoveries);
    await runPipeline(ordered, registry, ctx);
    await context.sync();

    return { tagsProcessed: ordered.length };
  });
}
