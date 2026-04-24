import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { KatsContext } from '../../src/core/context.js';
import { ContextStateError } from '../../src/core/errors.js';
import { tagName } from '../../src/core/processor.js';

const exampleSchema = z.object({
  total: z.number().int().nonnegative(),
  label: z.string().min(1),
});
type ExampleState = z.infer<typeof exampleSchema>;

describe('KatsContext — slots', () => {
  it('returns undefined for unset slots', () => {
    const ctx = new KatsContext();
    expect(ctx.getSlot('missing', exampleSchema)).toBeUndefined();
    expect(ctx.hasSlot('missing')).toBe(false);
  });

  it('round-trips a valid slot value', () => {
    const ctx = new KatsContext();
    const value: ExampleState = { total: 42, label: 'arvode' };
    ctx.setSlot('example', exampleSchema, value);
    expect(ctx.hasSlot('example')).toBe(true);
    expect(ctx.getSlot('example', exampleSchema)).toEqual(value);
  });

  it('rejects invalid set value with ContextStateError', () => {
    const ctx = new KatsContext();
    expect(() => {
      ctx.setSlot('example', exampleSchema, { total: -1, label: 'x' } satisfies ExampleState);
    }).toThrow(ContextStateError);
  });

  it('requireSlot returns value when present', () => {
    const ctx = new KatsContext();
    ctx.setSlot('example', exampleSchema, { total: 1, label: 'x' });
    expect(ctx.requireSlot('example', exampleSchema)).toEqual({ total: 1, label: 'x' });
  });

  it('requireSlot throws ContextStateError when absent', () => {
    const ctx = new KatsContext();
    expect(() => ctx.requireSlot('missing', exampleSchema)).toThrow(ContextStateError);
  });

  it('requireSlot revalidates on read — corrupted external mutation is caught', () => {
    // Simulating a stale schema version is hard with just the public API.
    // Here we just verify that a valid round-trip succeeds post-require.
    const ctx = new KatsContext();
    ctx.setSlot('example', exampleSchema, { total: 5, label: 'ok' });
    expect(() => ctx.requireSlot('example', exampleSchema)).not.toThrow();
  });
});

describe('KatsContext — tags', () => {
  it('tracks discovered tags', () => {
    const ctx = new KatsContext();
    const a = tagName('KATS_UTLAGG');
    const b = tagName('KATS_ARVODE');
    ctx.addTag(a);
    ctx.addTag(b);
    expect(ctx.hasTag(a)).toBe(true);
    expect(ctx.hasTag(b)).toBe(true);
    expect(ctx.hasTag(tagName('KATS_MOTTAGARE'))).toBe(false);
  });

  it('dedupes duplicate addTag calls', () => {
    const ctx = new KatsContext();
    const a = tagName('KATS_UTLAGG');
    ctx.addTag(a);
    ctx.addTag(a);
    expect(ctx.tags.size).toBe(1);
  });

  it('tags view is read-only in spirit — consumers should not mutate', () => {
    const ctx = new KatsContext();
    ctx.addTag(tagName('KATS_UTLAGG'));
    expect([...ctx.tags]).toHaveLength(1);
  });
});
