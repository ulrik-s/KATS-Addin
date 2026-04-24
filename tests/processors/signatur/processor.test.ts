import { describe, it, expect } from 'vitest';
import { KatsContext } from '../../../src/core/context.js';
import { ContextStateError, ProcessorError } from '../../../src/core/errors.js';
import { tagName } from '../../../src/core/processor.js';
import { MapProcessorRegistry, runPipeline, type Discovery } from '../../../src/core/pipeline.js';
import { type KatsUser } from '../../../src/domain/user-db.js';
import { FakeTextKatsRange } from '../../../src/io/fake-kats-range.js';
import { FakeTableKatsRange } from '../../../src/io/fake-kats-table.js';
import { setMottagareState } from '../../../src/processors/mottagare/state.js';
import {
  SignaturProcessor,
  getSignaturState,
  requireSignaturState,
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

function makeProcessor(overrides: { now?: () => Date; user?: KatsUser } = {}): SignaturProcessor {
  return new SignaturProcessor({
    now: overrides.now ?? ((): Date => FIXED_NOW),
    getCurrentUser: (): KatsUser => overrides.user ?? ULRIK,
  });
}

describe('SignaturProcessor — phase semantics', () => {
  it('read validates range kind but makes no document reads', async () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    const range = new FakeTextKatsRange(['old content']);
    await p.read(range, ctx);
    expect(range.paragraphs).toEqual(['old content']);
    expect(getSignaturState(ctx)).toBeUndefined();
  });

  it('read throws if given a table range', async () => {
    const p = makeProcessor();
    const tableRange = new FakeTableKatsRange([[[''], ['']]]);
    await expect(p.read(tableRange, new KatsContext())).rejects.toBeInstanceOf(ProcessorError);
  });

  it('transform populates the slot with 4 paragraphs', () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    p.transform(ctx);
    const state = requireSignaturState(ctx);
    expect(state.paragraphs).toEqual([
      'Utopia den 24 april 2026',
      '',
      'Ulrik Sjölin',
      'Ers Kjeserliga Överhöghet',
    ]);
  });

  it('transform prefers postort from context (set by MOTTAGARE)', () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    setMottagareState(ctx, { firstLine: 'Domstol', postort: 'Malmö' });
    p.transform(ctx);
    expect(requireSignaturState(ctx).paragraphs[0]).toBe('Malmö den 24 april 2026');
  });

  it('transform falls back to user.city when MOTTAGARE set empty postort', () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    setMottagareState(ctx, { firstLine: 'Någon', postort: '' });
    p.transform(ctx);
    expect(requireSignaturState(ctx).paragraphs[0]).toBe('Utopia den 24 april 2026');
  });

  it('transform falls back to user.city when MOTTAGARE did not run', () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    p.transform(ctx);
    expect(requireSignaturState(ctx).paragraphs[0]).toBe('Utopia den 24 april 2026');
  });

  it('render writes the 4 paragraphs from state to the range', async () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    const range = new FakeTextKatsRange(['placeholder']);
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
    const range = new FakeTextKatsRange();
    await expect(p.render(range, ctx)).rejects.toBeInstanceOf(ContextStateError);
  });

  it('render throws ProcessorError if given a table range', async () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    p.transform(ctx);
    const tableRange = new FakeTableKatsRange([[[''], ['']]]);
    await expect(p.render(tableRange, ctx)).rejects.toBeInstanceOf(ProcessorError);
  });
});

describe('SignaturProcessor — dependency injection', () => {
  it('uses the injected now() for the date', () => {
    const p = makeProcessor({ now: (): Date => new Date(2025, 0, 1) });
    const ctx = new KatsContext();
    p.transform(ctx);
    expect(requireSignaturState(ctx).paragraphs[0]).toBe('Utopia den 1 januari 2025');
  });

  it('NFC-normalizes user fields into the output', () => {
    const decomposed: KatsUser = {
      ...ULRIK,
      fullName: 'Ulrik Sjo\u0308lin',
      title: 'O\u0308verho\u0308ghet',
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
    const registry = new MapProcessorRegistry();
    registry.register(makeProcessor());

    const range = new FakeTextKatsRange(['[placeholder]']);
    const ctx = new KatsContext();
    const discoveries: Discovery[] = [{ tag: tagName('KATS_SIGNATUR'), range }];

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
