import { describe, it, expect } from 'vitest';
import { FakeKatsRange } from '../../src/io/fake-kats-range.js';

describe('FakeKatsRange', () => {
  it('starts empty by default', async () => {
    const r = new FakeKatsRange();
    expect(r.paragraphs).toEqual([]);
    expect(await r.getText()).toBe('');
  });

  it('accepts initial paragraphs', async () => {
    const r = new FakeKatsRange(['a', 'b']);
    expect(r.paragraphs).toEqual(['a', 'b']);
    expect(await r.getText()).toBe('a\rb');
  });

  it('setParagraphs replaces content', async () => {
    const r = new FakeKatsRange(['old']);
    await r.setParagraphs(['new1', 'new2', 'new3']);
    expect(r.paragraphs).toEqual(['new1', 'new2', 'new3']);
  });

  it('getText joins with \\r (Word paragraph separator)', async () => {
    const r = new FakeKatsRange(['Lund den 24 april 2026', '', 'Ulrik Sjölin', 'Ers Titel']);
    expect(await r.getText()).toBe('Lund den 24 april 2026\r\rUlrik Sjölin\rErs Titel');
  });

  it('preserves the readonly contract — external mutation of input array is ignored', async () => {
    const input = ['a', 'b'];
    const r = new FakeKatsRange(input);
    input.push('c');
    expect(r.paragraphs).toEqual(['a', 'b']);

    const setInput = ['x', 'y'];
    await r.setParagraphs(setInput);
    setInput.push('z');
    expect(r.paragraphs).toEqual(['x', 'y']);
  });
});
