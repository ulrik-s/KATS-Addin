import { type KatsContext } from './context.js';
import { ProcessorError } from './errors.js';
import { type Processor, type TagName } from './processor.js';
import { type KatsRange } from '../io/kats-range.js';

/** A tag discovered in the document paired with the range covering its content. */
export interface Discovery {
  readonly tag: TagName;
  readonly range: KatsRange;
}

/** Source of truth for which processor handles which tag. */
export interface ProcessorRegistry {
  get(tag: TagName): Processor | undefined;
}

/** Simple Map-backed registry implementation. */
export class MapProcessorRegistry implements ProcessorRegistry {
  private readonly byTag = new Map<TagName, Processor>();

  register(processor: Processor): void {
    if (this.byTag.has(processor.tag)) {
      throw new Error(`Processor already registered for tag: ${processor.tag as string}`);
    }
    this.byTag.set(processor.tag, processor);
  }

  get(tag: TagName): Processor | undefined {
    return this.byTag.get(tag);
  }
}

interface WorkItem {
  readonly processor: Processor;
  readonly range: KatsRange;
}

function resolveWork(
  discoveries: readonly Discovery[],
  registry: ProcessorRegistry,
  ctx: KatsContext,
): WorkItem[] {
  const work: WorkItem[] = [];
  for (const d of discoveries) {
    const processor = registry.get(d.tag);
    if (!processor) {
      throw new ProcessorError('no processor registered for tag', d.tag, 'read');
    }
    ctx.addTag(d.tag);
    work.push({ processor, range: d.range });
  }
  return work;
}

/**
 * Execute the pipeline phase-at-a-time:
 *   1. Every processor's `read` (awaited serially)
 *   2. Every processor's `transform` (synchronous, declared order)
 *   3. Every processor's `render` (awaited serially)
 *
 * Order within each phase is the order discoveries were passed in. That
 * order matters for `transform`: cross-processor dependencies (e.g. ARVODE
 * reading UTLAGG state) assume upstream processors have run earlier in the
 * same phase.
 *
 * Any exception is wrapped in `ProcessorError` tagging which processor and
 * phase failed. The original is preserved via `cause`.
 */
export async function runPipeline(
  discoveries: readonly Discovery[],
  registry: ProcessorRegistry,
  ctx: KatsContext,
): Promise<void> {
  const work = resolveWork(discoveries, registry, ctx);

  // Phase 1: read
  for (const { processor, range } of work) {
    try {
      await processor.read(range, ctx);
    } catch (cause) {
      if (cause instanceof ProcessorError) throw cause;
      throw new ProcessorError(messageOf(cause), processor.tag, 'read', { cause });
    }
  }

  // Phase 2: transform (synchronous on purpose)
  for (const { processor } of work) {
    try {
      processor.transform(ctx);
    } catch (cause) {
      if (cause instanceof ProcessorError) throw cause;
      throw new ProcessorError(messageOf(cause), processor.tag, 'transform', { cause });
    }
  }

  // Phase 3: render
  for (const { processor, range } of work) {
    try {
      await processor.render(range, ctx);
    } catch (cause) {
      if (cause instanceof ProcessorError) throw cause;
      throw new ProcessorError(messageOf(cause), processor.tag, 'render', { cause });
    }
  }
}

function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
