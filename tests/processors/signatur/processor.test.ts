import { describe, it, expect } from 'vitest';
import { KatsContext } from '../../../src/core/context.js';
import { ContextStateError } from '../../../src/core/errors.js';
import { tagName } from '../../../src/core/processor.js';
import { MapProcessorRegistry, runPipeline, type Discovery } from '../../../src/core/pipeline.js';
import { type KatsUser } from '../../../src/domain/user-db.js';
import { FakeKatsRange } from '../../../src/io/fake-kats-range.js';
import { type KatsRange } from '../../../src/io/kats-range.js';
import {
  SignaturProcessor,
  requireSignaturState,
  getSignaturState,
} from '../../../src/processors/signatur/index.js';

const FIXED_NOW = new Date(2026, 3, 24); // 24 april 2026

const ULRIK: KatsUser = {
  key: 'ulrik',
  shortName: 'Ulrik',
  fullName: 'Ulrik Sjölin',
  mileageKrPerKm: 483.99,
  title: 'Ers Kjeserliga Överhöghet',
  city: 'Utopia',
  aliases: [],
};

function makeProcessor(
  overrides: {
    now?: () => Date;
    user?: KatsUser;
    getPostort?: () => string | undefined;
  } = {},
): SignaturProcessor {
  return new SignaturProcessor({
    now: overrides.now ?? ((): Date => FIXED_NOW),
    getCurrentUser: (): KatsUser => overrides.user ?? ULRIK,
    ...(overrides.getPostort !== undefined ? { getPostort: overrides.getPostort } : {}),
  });
}

describe('SignaturProcessor — phase semantics', () => {
  it('read is a no-op (SIGNATUR takes no input from document)', async () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    const range = new FakeKatsRange(['old content']);
    await p.read(range, ctx);
    // Range unchanged, no slot set.
    expect(range.paragraphs).toEqual(['old content']);
    expect(getSignaturState(ctx)).toBeUndefined();
  });

  it('transform populates the slot with 4 paragraphs', () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    p.transform(ctx);
    const state = requireSignaturState(ctx);
    expect(state.paragraphs).toHaveLength(4);
    expect(state.paragraphs).toEqual([
      'Utopia den 24 april 2026',
      '',
      'Ulrik Sjölin',
      'Ers Kjeserliga Överhöghet',
    ]);
  });

  it('transform uses postort when getPostort returns a city', () => {
    const p = makeProcessor({ getPostort: (): string | undefined => 'Malmö' });
    const ctx = new KatsContext();
    p.transform(ctx);
    expect(requireSignaturState(ctx).paragraphs[0]).toBe('Malmö den 24 april 2026');
  });

  it('transform falls back to user.city when getPostort returns undefined', () => {
    const p = makeProcessor({ getPostort: (): string | undefined => undefined });
    const ctx = new KatsContext();
    p.transform(ctx);
    expect(requireSignaturState(ctx).paragraphs[0]).toBe('Utopia den 24 april 2026');
  });

  it('transform falls back to user.city when getPostort is omitted entirely', () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    p.transform(ctx);
    expect(requireSignaturState(ctx).paragraphs[0]).toBe('Utopia den 24 april 2026');
  });

  it('transform falls back to user.city when getPostort returns empty string', () => {
    const p = makeProcessor({ getPostort: (): string | undefined => '' });
    const ctx = new KatsContext();
    p.transform(ctx);
    expect(requireSignaturState(ctx).paragraphs[0]).toBe('Utopia den 24 april 2026');
  });

  it('render writes the 4 paragraphs from state to the range', async () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    const range = new FakeKatsRange(['placeholder']);
    p.transform(ctx);
    await p.render(range, ctx);
    expect(range.paragraphs).toEqual([
      'Utopia den 24 april 2026',
      '',
      'Ulrik Sjölin',
      'Ers Kjeserliga Överhöghet',
    ]);
  });

  it('render throws ContextStateError if transform did not run', async () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    const range = new FakeKatsRange();
    await expect(p.render(range, ctx)).rejects.toBeInstanceOf(ContextStateError);
  });
});

describe('SignaturProcessor — dependency injection', () => {
  it('uses the injected now() for the date', () => {
    const p = makeProcessor({ now: (): Date => new Date(2025, 0, 1) });
    const ctx = new KatsContext();
    p.transform(ctx);
    expect(requireSignaturState(ctx).paragraphs[0]).toBe('Utopia den 1 januari 2025');
  });

  it('uses the injected user', () => {
    const maria: KatsUser = {
      key: 'maria',
      shortName: 'Maria',
      fullName: 'Maria Grosskopf',
      mileageKrPerKm: 12,
      title: 'Advokat',
      city: 'Lund',
      aliases: [],
    };
    const p = makeProcessor({ user: maria });
    const ctx = new KatsContext();
    p.transform(ctx);
    const out = requireSignaturState(ctx).paragraphs;
    expect(out[0]).toBe('Lund den 24 april 2026');
    expect(out[2]).toBe('Maria Grosskopf');
    expect(out[3]).toBe('Advokat');
  });

  it('NFC-normalizes user fields into the output', () => {
    const decomposed: KatsUser = {
      ...ULRIK,
      fullName: 'Ulrik Sjo\u0308lin', // NFD
      title: 'O\u0308verho\u0308ghet', // NFD
      city: 'Go\u0308teborg',
    };
    const p = makeProcessor({ user: decomposed });
    const ctx = new KatsContext();
    p.transform(ctx);
    const [dateLine, , name, title] = requireSignaturState(ctx).paragraphs;
    expect(dateLine).toBe('Göteborg den 24 april 2026');
    expect(name).toBe('Ulrik Sjölin');
    expect(title).toBe('Överhöghet');
  });
});

describe('SignaturProcessor — pipeline integration', () => {
  it('runs inside runPipeline and writes to the range', async () => {
    const registry = new MapProcessorRegistry<KatsRange>();
    registry.register(makeProcessor());

    const range = new FakeKatsRange(['[placeholder]']);
    const ctx = new KatsContext();
    const discoveries: Discovery<KatsRange>[] = [{ tag: tagName('KATS_SIGNATUR'), range }];

    await runPipeline(discoveries, registry, ctx);

    expect(ctx.hasTag(tagName('KATS_SIGNATUR'))).toBe(true);
    expect(range.paragraphs).toEqual([
      'Utopia den 24 april 2026',
      '',
      'Ulrik Sjölin',
      'Ers Kjeserliga Överhöghet',
    ]);
  });
});
