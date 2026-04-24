import { describe, it, expect } from 'vitest';
import { FakeKatsDocument } from '../../src/io/fake-kats-document.js';

describe('FakeKatsDocument', () => {
  it('replaces every literal occurrence', async () => {
    const doc = new FakeKatsDocument('A [KundNamn] and [KundNamn] and [KundNamn].');
    const count = await doc.replaceAll('[KundNamn]', 'Ulrik');
    expect(count).toBe(3);
    expect(doc.body).toBe('A Ulrik and Ulrik and Ulrik.');
  });

  it('returns 0 when needle is not found', async () => {
    const doc = new FakeKatsDocument('plain text');
    expect(await doc.replaceAll('[missing]', 'x')).toBe(0);
    expect(doc.body).toBe('plain text');
  });

  it('empty search string is a no-op that returns 0', async () => {
    const doc = new FakeKatsDocument('hello');
    expect(await doc.replaceAll('', 'x')).toBe(0);
    expect(doc.body).toBe('hello');
  });

  it('handles overlapping-looking strings correctly (non-greedy left-to-right)', async () => {
    const doc = new FakeKatsDocument('aaa');
    expect(await doc.replaceAll('aa', 'b')).toBe(1);
    expect(doc.body).toBe('ba');
  });

  it('preserves Swedish diacritics in replacements', async () => {
    const doc = new FakeKatsDocument('Välkommen [KundNamn]!');
    await doc.replaceAll('[KundNamn]', 'Åsa Östlund');
    expect(doc.body).toBe('Välkommen Åsa Östlund!');
  });

  it('does not regex-interpret the search string', async () => {
    const doc = new FakeKatsDocument('a.b.c');
    expect(await doc.replaceAll('.', '_')).toBe(2);
    expect(doc.body).toBe('a_b_c');
  });
});
