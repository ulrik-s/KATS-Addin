import { describe, it, expect } from 'vitest';
import { KatsContext } from '../../../src/core/context.js';
import { type KatsUser } from '../../../src/domain/user-db.js';
import { FakeTextKatsRange } from '../../../src/io/fake-kats-range.js';
import { setMottagareState } from '../../../src/processors/mottagare/state.js';
import {
  YttrandeSignaturProcessor,
  requireYttrandeSignaturState,
} from '../../../src/processors/yttrande-signatur/index.js';

const FIXED_NOW = new Date(2026, 3, 24);

const ULRIK: KatsUser = {
  key: 'ulrik',
  shortName: 'Ulrik',
  fullName: 'Ulrik Sjölin',
  mileageKrPerKm: 483.99,
  title: 'Ers Kjeserliga Överhöghet',
  city: 'Utopia',
  aliases: [],
};

function makeProcessor(user: KatsUser = ULRIK): YttrandeSignaturProcessor {
  return new YttrandeSignaturProcessor({
    now: (): Date => FIXED_NOW,
    getCurrentUser: (): KatsUser => user,
  });
}

describe('YttrandeSignaturProcessor', () => {
  it('produces the same 4-paragraph signature shape as SIGNATUR', async () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    const range = new FakeTextKatsRange();
    p.transform(ctx);
    await p.render(range, ctx);
    expect(range.paragraphs).toEqual([
      'Utopia den 24 april 2026',
      '',
      'Ulrik Sjölin',
      'Ers Kjeserliga Överhöghet',
    ]);
  });

  it('IGNORES postort set by MOTTAGARE — uses user.city', () => {
    const p = makeProcessor();
    const ctx = new KatsContext();
    // MOTTAGARE ran and set a postort, but we must not use it.
    setMottagareState(ctx, { firstLine: 'Whatever', postort: 'Stockholm' });
    p.transform(ctx);
    expect(requireYttrandeSignaturState(ctx).paragraphs[0]).toBe('Utopia den 24 april 2026');
  });

  it('falls back to "Lund" when user.city is empty', () => {
    const noCityUser: KatsUser = { ...ULRIK, city: '   ' };
    const p = makeProcessor(noCityUser);
    const ctx = new KatsContext();
    p.transform(ctx);
    expect(requireYttrandeSignaturState(ctx).paragraphs[0]).toBe('Lund den 24 april 2026');
  });

  it('NFC-normalizes output', () => {
    const nfdUser: KatsUser = {
      ...ULRIK,
      fullName: 'Sjo\u0308lin',
      title: 'O\u0308verho\u0308ghet',
      city: 'Go\u0308teborg',
    };
    const p = makeProcessor(nfdUser);
    const ctx = new KatsContext();
    p.transform(ctx);
    const paragraphs = requireYttrandeSignaturState(ctx).paragraphs;
    expect(paragraphs[0]).toBe('Göteborg den 24 april 2026');
    expect(paragraphs[2]).toBe('Sjölin');
    expect(paragraphs[3]).toBe('Överhöghet');
  });
});
