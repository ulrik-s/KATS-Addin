import { z } from 'zod';
import { type KatsContext } from './context.js';

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

/** Contract every processor implements. `TRange` is abstract so tests can pass fakes. */
export interface Processor<TRange> {
  /** The tag this processor handles, e.g. tagName("KATS_UTLAGGSSPECIFIKATION"). */
  readonly tag: TagName;

  /**
   * Phase 1. Read document content into ctx. Runs before any processor's
   * transform or render. Should mutate ctx only via this processor's slot.
   */
  read(range: TRange, ctx: KatsContext): Promise<void>;

  /**
   * Phase 2. Pure business logic. No Office JS calls. Reads own + other
   * processors' read-state from ctx; writes transform-state back.
   */
  transform(ctx: KatsContext): void;

  /**
   * Phase 3. Write transformed state back to document. Runs after every
   * processor's transform has completed.
   */
  render(range: TRange, ctx: KatsContext): Promise<void>;
}
