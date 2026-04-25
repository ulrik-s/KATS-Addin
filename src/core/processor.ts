import { z } from 'zod';
import { type KatsContext } from './context.js';
import { ProcessorError } from './errors.js';
import { type KatsRange, type TableKatsRange, type TextKatsRange } from '../io/kats-range.js';

/** The three pipeline phases, in execution order. */
export const PHASES = ['read', 'transform', 'render'] as const;
export type Phase = (typeof PHASES)[number];

/**
 * Branded validated tag name. Use `tagName("KATS_UTLAGGSSPECIFIKATION")` at
 * module load time — the cast elsewhere is blocked at compile time.
 */
const tagNameSchema = z
  .string()
  .regex(/^KATS_[A-Z_]+$/, 'Tag must match /^KATS_[A-Z_]+$/')
  .brand<'TagName'>();
export type TagName = z.infer<typeof tagNameSchema>;

/** Construct a validated TagName. Throws ZodError on invalid input. */
export function tagName(raw: string): TagName {
  return tagNameSchema.parse(raw);
}

/**
 * Contract every processor implements. Processors accept the union
 * `KatsRange` at the boundary and use `requireTextRange` /
 * `requireTableRange` to narrow inside `read` and `render`. This keeps
 * the pipeline uniform while letting each processor declare its
 * expected shape locally.
 */
export interface Processor {
  /** The tag this processor handles, e.g. `tagName("KATS_UTLAGGSSPECIFIKATION")`. */
  readonly tag: TagName;

  /**
   * What kind of range the processor needs. The orchestrator skips
   * discoveries whose actual `range.kind` doesn't match — typical
   * cause: drafter forgot to put a table between START/END markers,
   * leaving empty paragraphs. Skipping keeps the run going and the
   * scanner has already stripped the marker text, so the user can
   * fix the doc and re-run without leftover markers.
   *
   * Optional so processors that genuinely accept either kind can opt
   * out (none today).
   */
  readonly requiresRangeKind?: 'text' | 'table';

  /**
   * Phase 1. Read document content into ctx. Runs before any processor's
   * transform or render. Should mutate ctx only via this processor's slot.
   */
  read(range: KatsRange, ctx: KatsContext): Promise<void>;

  /**
   * Phase 2. Pure business logic. No Office JS calls. Reads own + other
   * processors' read-state from ctx; writes transform-state back.
   */
  transform(ctx: KatsContext): void;

  /**
   * Phase 3. Write transformed state back to document. Runs after every
   * processor's transform has completed.
   */
  render(range: KatsRange, ctx: KatsContext): Promise<void>;
}

/**
 * Narrow a `KatsRange` to `TextKatsRange`. Throws `ProcessorError` with
 * the calling processor's tag + phase if the shape is wrong.
 */
export function requireTextRange(range: KatsRange, tag: TagName, phase: Phase): TextKatsRange {
  if (range.kind !== 'text') {
    throw new ProcessorError(`expected text range, got ${range.kind} range`, tag, phase);
  }
  return range;
}

/** Narrow a `KatsRange` to `TableKatsRange`. Throws on mismatch. */
export function requireTableRange(range: KatsRange, tag: TagName, phase: Phase): TableKatsRange {
  if (range.kind !== 'table') {
    throw new ProcessorError(`expected table range, got ${range.kind} range`, tag, phase);
  }
  return range;
}
