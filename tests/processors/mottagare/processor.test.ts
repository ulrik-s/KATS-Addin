import { describe, it, expect } from 'vitest';
import { KatsContext } from '../../../src/core/context.js';
import { ProcessorError } from '../../../src/core/errors.js';
import { tagName } from '../../../src/core/processor.js';
import { type Discovery, MapProcessorRegistry, runPipeline } from '../../../src/core/pipeline.js';
import { FakeTextKatsRange } from '../../../src/io/fake-kats-range.js';
import { FakeTableKatsRange } from '../../../src/io/fake-kats-table.js';
import {
  MottagareProcessor,
  getMottagareState,
  getPostortFromContext,
  requireMottagareState,
} from '../../../src/processors/mottagare/index.js';

function tableWithAddress(cell01: readonly string[]): FakeTableKatsRange {
  return new FakeTableKatsRange([[['Till:'], [...cell01]]]);
}

describe('MottagareProcessor — read', () => {
  it('parses firstLine and postort from the 1×2 table cell', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Tingsrätten i Malmö', 'Box 847', '201 24 Malmö']);
    await p.read(range, ctx);
    const state = requireMottagareState(ctx);
    expect(state.firstLine).toBe('Tingsrätten i Malmö');
    expect(state.postort).toBe('Malmö');
  });

  it('parses when no postcode line — postort stays empty', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Hyresnämnden i Lund', 'attn. ordföranden']);
    await p.read(range, ctx);
    const state = requireMottagareState(ctx);
    expect(state.firstLine).toBe('Hyresnämnden i Lund');
    expect(state.postort).toBe('');
  });

  it('NFC-normalizes the stored firstLine and postort', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Sjo\u0308lin AB', '391 33 kalmär']);
    await p.read(range, ctx);
    const state = requireMottagareState(ctx);
    expect(state.firstLine).toBe('Sjölin AB');
    expect(state.postort).toBe('Kalmär');
    // Every output is idempotent under NFC.
    expect(state.firstLine.normalize('NFC')).toBe(state.firstLine);
  });

  it('throws if given a text range instead of a table', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    await expect(p.read(new FakeTextKatsRange(), ctx)).rejects.toBeInstanceOf(ProcessorError);
  });

  it('throws if the table has fewer than 2 columns', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = new FakeTableKatsRange([[['Till:']]]);
    await expect(p.read(range, ctx)).rejects.toBeInstanceOf(ProcessorError);
  });

  it('throws if the recipient block is empty', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['', '  ', '\t']);
    await expect(p.read(range, ctx)).rejects.toBeInstanceOf(ProcessorError);
  });
});

describe('MottagareProcessor — render (court vs non-court branching)', () => {
  it('court recipient: collapses to firstLine + "via e-post"', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Tingsrätten i Malmö', 'Box 847', '201 24 Malmö']);
    await p.read(range, ctx);
    p.transform(ctx);
    await p.render(range, ctx);

    const snapshot = range.snapshot();
    expect(snapshot[0]?.[0]).toEqual(['Till:']); // label cell untouched
    expect(snapshot[0]?.[1]).toEqual(['Tingsrätten i Malmö', 'via e-post']);
  });

  it('hovrätt recipient: also collapses to firstLine + "via e-post"', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress([
      'Hovrätten över Skåne och Blekinge',
      'Box 846',
      '201 80 Malmö',
    ]);
    await p.read(range, ctx);
    p.transform(ctx);
    await p.render(range, ctx);

    expect(range.snapshot()[0]?.[1]).toEqual(['Hovrätten över Skåne och Blekinge', 'via e-post']);
  });

  it('non-court (Kronofogden): keeps the full address block unchanged', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Kronofogden', 'Box 1050', '172 21 Sundbyberg']);
    await p.read(range, ctx);
    p.transform(ctx);
    await p.render(range, ctx);

    expect(range.snapshot()[0]?.[1]).toEqual(['Kronofogden', 'Box 1050', '172 21 Sundbyberg']);
  });

  it('non-court (Hyresnämnden) without postcode: keeps both lines', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Hyresnämnden i Lund', 'attn. ordföranden']);
    await p.read(range, ctx);
    p.transform(ctx);
    await p.render(range, ctx);

    expect(range.snapshot()[0]?.[1]).toEqual(['Hyresnämnden i Lund', 'attn. ordföranden']);
  });

  it('non-court single-line recipient: keeps the single line', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Sjölin AB']);
    await p.read(range, ctx);
    p.transform(ctx);
    await p.render(range, ctx);

    expect(range.snapshot()[0]?.[1]).toEqual(['Sjölin AB']);
  });

  it('court recipient with diacritic-stripped name still collapses', async () => {
    // Legacy doc with "Tingsratten" (no ä) — loose match should fire.
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Tingsratten i Lund', 'Box 75', '221 00 Lund']);
    await p.read(range, ctx);
    p.transform(ctx);
    await p.render(range, ctx);

    expect(range.snapshot()[0]?.[1]).toEqual(['Tingsratten i Lund', 'via e-post']);
  });

  it('render throws if read did not run first', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['x']);
    await expect(p.render(range, ctx)).rejects.toBeDefined();
  });
});

describe('MottagareProcessor — state shape (isCourt + addressLines)', () => {
  it('exposes isCourt=true and full addressLines on the state', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Tingsrätten i Malmö', 'Box 847', '201 24 Malmö']);
    await p.read(range, ctx);
    const state = requireMottagareState(ctx);
    expect(state.isCourt).toBe(true);
    expect(state.addressLines).toEqual(['Tingsrätten i Malmö', 'Box 847', '201 24 Malmö']);
  });

  it('exposes isCourt=false for non-courts', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Kronofogden', 'Box 1050', '172 21 Sundbyberg']);
    await p.read(range, ctx);
    const state = requireMottagareState(ctx);
    expect(state.isCourt).toBe(false);
    expect(state.addressLines).toEqual(['Kronofogden', 'Box 1050', '172 21 Sundbyberg']);
  });
});

describe('MottagareProcessor — context surface for downstream processors', () => {
  it('exposes postort via getPostortFromContext when parse found one', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Tingsrätten i Malmö', '201 24 Malmö']);
    await p.read(range, ctx);
    expect(getPostortFromContext(ctx)).toBe('Malmö');
  });

  it('returns undefined from getPostortFromContext when MOTTAGARE did not run', () => {
    expect(getPostortFromContext(new KatsContext())).toBeUndefined();
  });

  it('returns undefined from getPostortFromContext when postort was empty', async () => {
    const p = new MottagareProcessor();
    const ctx = new KatsContext();
    const range = tableWithAddress(['Hyresnämnden']);
    await p.read(range, ctx);
    expect(getPostortFromContext(ctx)).toBeUndefined();
  });

  it('getMottagareState returns undefined when processor has not run', () => {
    expect(getMottagareState(new KatsContext())).toBeUndefined();
  });
});

describe('MottagareProcessor — pipeline integration', () => {
  it('non-court runs end-to-end and preserves the full address', async () => {
    const registry = new MapProcessorRegistry();
    registry.register(new MottagareProcessor());

    const range = tableWithAddress(['Kronofogden', 'Box 1050', '172 21 Sundbyberg']);
    const ctx = new KatsContext();
    const discoveries: Discovery[] = [{ tag: tagName('KATS_MOTTAGARE'), range }];

    await runPipeline(discoveries, registry, ctx);

    expect(requireMottagareState(ctx).postort).toBe('Sundbyberg');
    expect(range.snapshot()[0]?.[1]).toEqual(['Kronofogden', 'Box 1050', '172 21 Sundbyberg']);
  });

  it('court runs end-to-end and collapses to firstLine + "via e-post"', async () => {
    const registry = new MapProcessorRegistry();
    registry.register(new MottagareProcessor());

    const range = tableWithAddress(['Tingsrätten i Malmö', 'Box 847', '201 24 Malmö']);
    const ctx = new KatsContext();
    const discoveries: Discovery[] = [{ tag: tagName('KATS_MOTTAGARE'), range }];

    await runPipeline(discoveries, registry, ctx);

    expect(range.snapshot()[0]?.[1]).toEqual(['Tingsrätten i Malmö', 'via e-post']);
  });
});
