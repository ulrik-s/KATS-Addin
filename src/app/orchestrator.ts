import { KatsContext } from '../core/context.js';
import { type Processor } from '../core/processor.js';
import { MapProcessorRegistry, runPipeline } from '../core/pipeline.js';
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

export interface RunResult {
  readonly tagsProcessed: number;
}

/**
 * Build the registry of all eight KATS processors with their
 * runtime dependencies.
 *
 * Processors are stateless beyond what they pin in their constructor;
 * `KatsContext` holds the per-run state. So one registry per run is
 * fine even though we could memoize.
 */
function buildRegistry(document: Word.Document): MapProcessorRegistry {
  const katsDocument = new WordKatsDocument(document.body);
  const now = (): Date => new Date();
  const user = (): ReturnType<typeof getCurrentUser> => getCurrentUser();

  const processors: Processor[] = [
    new MottagareProcessor(),
    new UtlaggProcessor({ getCurrentUser: user }),
    new ArgrupperTiderProcessor({ now }),
    new ArvodeProcessor(),
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
 * Discover and process every KATS tag in the active Word document.
 *
 * Single Word.run block so all reads, transforms, and renders share
 * one context — avoids the nested-context deadlocks the legacy VBA
 * port hit.
 */
export async function runOnActiveDocument(): Promise<RunResult> {
  return Word.run(async (context) => {
    const body = context.document.body;
    const discoveries = await discoverKatsTags(body);

    if (discoveries.length === 0) {
      return { tagsProcessed: 0 };
    }

    const registry = buildRegistry(context.document);
    const ctx = new KatsContext();
    await runPipeline(discoveries, registry, ctx);
    await context.sync();

    return { tagsProcessed: discoveries.length };
  });
}
