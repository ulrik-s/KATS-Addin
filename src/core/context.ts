import { type z } from 'zod';
import { ContextStateError } from './errors.js';
import { type TagName } from './processor.js';

/**
 * Shared state carried through the pipeline.
 *
 * Each processor owns a *slot* keyed by a short string (e.g. "utlagg"). The
 * slot value is validated by the processor's own zod schema on every read
 * and write — runtime type safety at the boundary replaces the compile-time
 * guarantee we lose by using an untyped map internally.
 *
 * Processor modules expose typed getState / setState wrappers so call sites
 * never touch the raw key + schema.
 */
export class KatsContext {
  private readonly _slots = new Map<string, unknown>();
  private readonly _tags = new Set<TagName>();

  /** Register that a tag was discovered in the document. */
  addTag(tag: TagName): void {
    this._tags.add(tag);
  }

  /** Was this tag present in the document? */
  hasTag(tag: TagName): boolean {
    return this._tags.has(tag);
  }

  /** Read-only view of all tags discovered in this run. */
  get tags(): ReadonlySet<TagName> {
    return this._tags;
  }

  /** Set a slot. Value is validated against the schema before storing. */
  setSlot<T>(key: string, schema: z.ZodType<T>, value: T): void {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new ContextStateError(key, `invalid set value: ${result.error.message}`);
    }
    this._slots.set(key, result.data);
  }

  /** Get a slot if present, otherwise undefined. Revalidated on every read. */
  getSlot<T>(key: string, schema: z.ZodType<T>): T | undefined {
    if (!this._slots.has(key)) return undefined;
    const raw = this._slots.get(key);
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new ContextStateError(key, `stored value fails schema: ${result.error.message}`);
    }
    return result.data;
  }

  /** Get a slot or throw. Use when a processor relies on another having run. */
  requireSlot<T>(key: string, schema: z.ZodType<T>): T {
    const value = this.getSlot(key, schema);
    if (value === undefined) {
      throw new ContextStateError(key, 'required slot is empty');
    }
    return value;
  }

  /** Presence check without fetching or validating the slot. */
  hasSlot(key: string): boolean {
    return this._slots.has(key);
  }
}
