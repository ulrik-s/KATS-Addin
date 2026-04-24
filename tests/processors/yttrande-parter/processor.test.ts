import { describe, it, expect } from 'vitest';
import { KatsContext } from '../../../src/core/context.js';
import { ProcessorError } from '../../../src/core/errors.js';
import { tagName } from '../../../src/core/processor.js';
import { type Discovery, MapProcessorRegistry, runPipeline } from '../../../src/core/pipeline.js';
import { FakeKatsDocument } from '../../../src/io/fake-kats-document.js';
import { FakeTextKatsRange } from '../../../src/io/fake-kats-range.js';
import { FakeTableKatsRange } from '../../../src/io/fake-kats-table.js';
import {
  YttrandeParterProcessor,
  requireYttrandeParterState,
} from '../../../src/processors/yttrande-parter/index.js';

function makeProcessor(document: FakeKatsDocument = new FakeKatsDocument('')): {
  processor: YttrandeParterProcessor;
  document: FakeKatsDocument;
} {
  return { processor: new YttrandeParterProcessor({ document }), document };
}

const EXAMPLE_BLOCK =
  'Åsa Östlund ./. Björn Bergendorff\n' +
  '\n' +
  'Åsa Östlund, 800101-1234\n' +
  'Motpart: Björn Bergendorff, 700202-5678\n' +
  'Vittne Svensson, 900303-0000\n';

describe('YttrandeParterProcessor — phases', () => {
  it('read captures raw text from the range', async () => {
    const { processor } = makeProcessor();
    const ctx = new KatsContext();
    const range = new FakeTextKatsRange(EXAMPLE_BLOCK.split('\n'));
    await processor.read(range, ctx);
    // rawText is internal; we verify via transform below.
    processor.transform(ctx);
    expect(requireYttrandeParterState(ctx).leftParty).toBe('Åsa Östlund');
  });

  it('read throws on a table range', async () => {
    const { processor } = makeProcessor();
    const table = new FakeTableKatsRange([[['a'], ['b']]]);
    await expect(processor.read(table, new KatsContext())).rejects.toBeInstanceOf(ProcessorError);
  });

  it('transform populates leftParty, rightParty, and options (deduped)', async () => {
    const { processor } = makeProcessor();
    const ctx = new KatsContext();
    const range = new FakeTextKatsRange(EXAMPLE_BLOCK.split('\n'));
    await processor.read(range, ctx);
    processor.transform(ctx);
    const state = requireYttrandeParterState(ctx);
    expect(state.leftParty).toBe('Åsa Östlund');
    expect(state.rightParty).toBe('Björn Bergendorff');
    expect(state.options).toEqual(['Åsa Östlund', 'Björn Bergendorff', 'Vittne Svensson']);
  });

  it('transform defaults rightParty to leftParty when no Motpart: line', async () => {
    const { processor } = makeProcessor();
    const ctx = new KatsContext();
    const range = new FakeTextKatsRange(['Åsa Östlund', '', 'Åsa Östlund, 800101-1234']);
    await processor.read(range, ctx);
    processor.transform(ctx);
    const state = requireYttrandeParterState(ctx);
    expect(state.leftParty).toBe('Åsa Östlund');
    expect(state.rightParty).toBe('Åsa Östlund');
  });

  it('transform throws when left party cannot be extracted', async () => {
    const { processor } = makeProcessor();
    const ctx = new KatsContext();
    const range = new FakeTextKatsRange(['']);
    await processor.read(range, ctx);
    expect(() => {
      processor.transform(ctx);
    }).toThrow(ProcessorError);
  });

  it('render replaces [KundNamn] in the document body with the left party', async () => {
    const doc = new FakeKatsDocument(
      'Hej [KundNamn], välkommen. [KundNamn] ska betala till [KundNamn].',
    );
    const { processor } = makeProcessor(doc);
    const ctx = new KatsContext();
    const range = new FakeTextKatsRange(EXAMPLE_BLOCK.split('\n'));

    await processor.read(range, ctx);
    processor.transform(ctx);
    await processor.render(range, ctx);

    expect(doc.body).toBe('Hej Åsa Östlund, välkommen. Åsa Östlund ska betala till Åsa Östlund.');
  });

  it('render leaves body unchanged when [KundNamn] not present', async () => {
    const doc = new FakeKatsDocument('Yttrande från advokaten.');
    const { processor } = makeProcessor(doc);
    const ctx = new KatsContext();
    const range = new FakeTextKatsRange(EXAMPLE_BLOCK.split('\n'));

    await processor.read(range, ctx);
    processor.transform(ctx);
    await processor.render(range, ctx);

    expect(doc.body).toBe('Yttrande från advokaten.');
  });

  it('render writes the two dropdowns with correct options, defaults, and separator', async () => {
    const { processor } = makeProcessor();
    const ctx = new KatsContext();
    const range = new FakeTextKatsRange(EXAMPLE_BLOCK.split('\n'));

    await processor.read(range, ctx);
    processor.transform(ctx);
    await processor.render(range, ctx);

    expect(range.paragraphs).toEqual([]);
    expect(range.dropdowns).toEqual({
      left: {
        options: ['Åsa Östlund', 'Björn Bergendorff', 'Vittne Svensson'],
        defaultValue: 'Åsa Östlund',
        underlined: true,
      },
      separator: ' ./. ',
      right: {
        options: ['Åsa Östlund', 'Björn Bergendorff', 'Vittne Svensson'],
        defaultValue: 'Björn Bergendorff',
        underlined: false,
      },
    });
  });

  it('render throws if given a table range', async () => {
    const { processor } = makeProcessor();
    const ctx = new KatsContext();
    const textRange = new FakeTextKatsRange(EXAMPLE_BLOCK.split('\n'));
    await processor.read(textRange, ctx);
    processor.transform(ctx);
    const tableRange = new FakeTableKatsRange([[['x'], ['y']]]);
    await expect(processor.render(tableRange, ctx)).rejects.toBeInstanceOf(ProcessorError);
  });
});

describe('YttrandeParterProcessor — pipeline integration', () => {
  it('runs end-to-end inside runPipeline', async () => {
    const doc = new FakeKatsDocument('Klient: [KundNamn]. Målsökande: [KundNamn].');
    const { processor } = makeProcessor(doc);
    const registry = new MapProcessorRegistry();
    registry.register(processor);

    const range = new FakeTextKatsRange(EXAMPLE_BLOCK.split('\n'));
    const ctx = new KatsContext();
    const discoveries: Discovery[] = [{ tag: tagName('KATS_YTTRANDE_PARTER'), range }];

    await runPipeline(discoveries, registry, ctx);

    expect(doc.body).toBe('Klient: Åsa Östlund. Målsökande: Åsa Östlund.');
    expect(range.dropdowns?.left.defaultValue).toBe('Åsa Östlund');
    expect(range.dropdowns?.right.defaultValue).toBe('Björn Bergendorff');
  });
});

describe('YttrandeParterProcessor — diacritic robustness', () => {
  it('NFC-normalizes NFD input before extraction', async () => {
    const doc = new FakeKatsDocument('[KundNamn]');
    const { processor } = makeProcessor(doc);
    const ctx = new KatsContext();
    const block = [
      'A\u0308sa O\u0308stlund ./. Bjo\u0308rn',
      '',
      'A\u0308sa O\u0308stlund, 800101-1234',
      'Motpart: Bjo\u0308rn Bergendorff, 700202-5678',
    ];
    const range = new FakeTextKatsRange(block);

    await processor.read(range, ctx);
    processor.transform(ctx);
    await processor.render(range, ctx);

    expect(doc.body).toBe('Äsa Östlund');
    expect(range.dropdowns?.left.defaultValue).toBe('Äsa Östlund');
    expect(range.dropdowns?.right.defaultValue).toBe('Björn Bergendorff');
  });
});
