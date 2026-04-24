import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { KatsContext } from '../../src/core/context.js';
import { ProcessorError } from '../../src/core/errors.js';
import { type Processor, type TagName, tagName } from '../../src/core/processor.js';
import { type Discovery, MapProcessorRegistry, runPipeline } from '../../src/core/pipeline.js';
import { FakeTextKatsRange } from '../../src/io/fake-kats-range.js';

interface SpyEvent {
  readonly tag: string;
  readonly phase: 'read' | 'transform' | 'render';
}

const counterSchema = z.object({ reads: z.number(), transforms: z.number() });

function makeSpyProcessor(
  tag: TagName,
  events: SpyEvent[],
  opts: { throwIn?: 'read' | 'transform' | 'render' } = {},
): Processor {
  return {
    tag,
    async read(_range, ctx) {
      events.push({ tag: tag, phase: 'read' });
      if (opts.throwIn === 'read') throw new Error('boom-read');
      const prev = ctx.getSlot(`spy:${tag as unknown as string}`, counterSchema) ?? {
        reads: 0,
        transforms: 0,
      };
      ctx.setSlot(`spy:${tag as unknown as string}`, counterSchema, {
        reads: prev.reads + 1,
        transforms: prev.transforms,
      });
      await Promise.resolve();
    },
    transform(ctx) {
      events.push({ tag: tag, phase: 'transform' });
      if (opts.throwIn === 'transform') throw new Error('boom-transform');
      const prev = ctx.requireSlot(`spy:${tag as unknown as string}`, counterSchema);
      ctx.setSlot(`spy:${tag as unknown as string}`, counterSchema, {
        reads: prev.reads,
        transforms: prev.transforms + 1,
      });
    },
    async render(_range, _ctx) {
      events.push({ tag: tag, phase: 'render' });
      if (opts.throwIn === 'render') throw new Error('boom-render');
      await Promise.resolve();
    },
  };
}

describe('runPipeline — phase ordering', () => {
  it('runs every read before any transform, and every transform before any render', async () => {
    const events: SpyEvent[] = [];
    const tagA = tagName('KATS_UTLAGG');
    const tagB = tagName('KATS_ARVODE');
    const tagC = tagName('KATS_SIGNATUR');

    const registry = new MapProcessorRegistry();
    registry.register(makeSpyProcessor(tagA, events));
    registry.register(makeSpyProcessor(tagB, events));
    registry.register(makeSpyProcessor(tagC, events));

    const discoveries: Discovery[] = [
      { tag: tagA, range: new FakeTextKatsRange() },
      { tag: tagB, range: new FakeTextKatsRange() },
      { tag: tagC, range: new FakeTextKatsRange() },
    ];

    const ctx = new KatsContext();
    await runPipeline(discoveries, registry, ctx);

    const phases = events.map((e) => e.phase);
    expect(phases).toEqual([
      'read',
      'read',
      'read',
      'transform',
      'transform',
      'transform',
      'render',
      'render',
      'render',
    ]);
    expect(events.slice(0, 3).map((e) => e.tag)).toEqual([
      'KATS_UTLAGG',
      'KATS_ARVODE',
      'KATS_SIGNATUR',
    ]);
    expect(events.slice(3, 6).map((e) => e.tag)).toEqual([
      'KATS_UTLAGG',
      'KATS_ARVODE',
      'KATS_SIGNATUR',
    ]);
    expect(events.slice(6, 9).map((e) => e.tag)).toEqual([
      'KATS_UTLAGG',
      'KATS_ARVODE',
      'KATS_SIGNATUR',
    ]);
  });

  it('registers every discovery tag in the context', async () => {
    const tagA = tagName('KATS_UTLAGG');
    const tagB = tagName('KATS_ARVODE');
    const registry = new MapProcessorRegistry();
    registry.register(makeSpyProcessor(tagA, []));
    registry.register(makeSpyProcessor(tagB, []));

    const ctx = new KatsContext();
    await runPipeline(
      [
        { tag: tagA, range: new FakeTextKatsRange() },
        { tag: tagB, range: new FakeTextKatsRange() },
      ],
      registry,
      ctx,
    );

    expect(ctx.hasTag(tagA)).toBe(true);
    expect(ctx.hasTag(tagB)).toBe(true);
  });
});

describe('runPipeline — error handling', () => {
  it('wraps a read-phase error in ProcessorError with phase="read"', async () => {
    const t = tagName('KATS_UTLAGG');
    const registry = new MapProcessorRegistry();
    registry.register(makeSpyProcessor(t, [], { throwIn: 'read' }));

    await expect(
      runPipeline([{ tag: t, range: new FakeTextKatsRange() }], registry, new KatsContext()),
    ).rejects.toMatchObject({ name: 'ProcessorError', phase: 'read', tag: t });
  });

  it('wraps a transform-phase error with phase="transform"', async () => {
    const t = tagName('KATS_ARVODE');
    const registry = new MapProcessorRegistry();
    registry.register(makeSpyProcessor(t, [], { throwIn: 'transform' }));

    await expect(
      runPipeline([{ tag: t, range: new FakeTextKatsRange() }], registry, new KatsContext()),
    ).rejects.toMatchObject({ name: 'ProcessorError', phase: 'transform' });
  });

  it('wraps a render-phase error with phase="render"', async () => {
    const t = tagName('KATS_SIGNATUR');
    const registry = new MapProcessorRegistry();
    registry.register(makeSpyProcessor(t, [], { throwIn: 'render' }));

    await expect(
      runPipeline([{ tag: t, range: new FakeTextKatsRange() }], registry, new KatsContext()),
    ).rejects.toMatchObject({ name: 'ProcessorError', phase: 'render' });
  });

  it('preserves the original error via `cause`', async () => {
    const t = tagName('KATS_UTLAGG');
    const registry = new MapProcessorRegistry();
    registry.register(makeSpyProcessor(t, [], { throwIn: 'transform' }));

    try {
      await runPipeline([{ tag: t, range: new FakeTextKatsRange() }], registry, new KatsContext());
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProcessorError);
      const err = e as ProcessorError;
      expect(err.cause).toBeInstanceOf(Error);
      expect((err.cause as Error).message).toBe('boom-transform');
    }
  });

  it('rethrows an already-wrapped ProcessorError without re-wrapping', async () => {
    const t = tagName('KATS_UTLAGG');
    const registry = new MapProcessorRegistry();
    registry.register({
      tag: t,
      read(_range, _ctx) {
        throw new ProcessorError('inner', t, 'read');
      },
      transform() {
        /* no-op */
      },
      render(_range, _ctx) {
        return Promise.resolve();
      },
    });
    try {
      await runPipeline([{ tag: t, range: new FakeTextKatsRange() }], registry, new KatsContext());
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProcessorError);
      const err = e as ProcessorError;
      expect(err.message).toContain('inner');
      expect(err.cause).toBeUndefined();
    }
  });

  it('throws ProcessorError when discovery tag has no registered processor', async () => {
    const registry = new MapProcessorRegistry();
    const t = tagName('KATS_MISSING');
    await expect(
      runPipeline([{ tag: t, range: new FakeTextKatsRange() }], registry, new KatsContext()),
    ).rejects.toBeInstanceOf(ProcessorError);
  });
});

describe('MapProcessorRegistry', () => {
  it('returns undefined for unknown tag', () => {
    const registry = new MapProcessorRegistry();
    expect(registry.get(tagName('KATS_UTLAGG'))).toBeUndefined();
  });

  it('retrieves a registered processor', () => {
    const registry = new MapProcessorRegistry();
    const t = tagName('KATS_UTLAGG');
    const p = makeSpyProcessor(t, []);
    registry.register(p);
    expect(registry.get(t)).toBe(p);
  });

  it('rejects double-registration for the same tag', () => {
    const registry = new MapProcessorRegistry();
    const t = tagName('KATS_UTLAGG');
    registry.register(makeSpyProcessor(t, []));
    expect(() => {
      registry.register(makeSpyProcessor(t, []));
    }).toThrow();
  });
});
