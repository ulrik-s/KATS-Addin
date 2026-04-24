import { describe, it, expect } from 'vitest';
import { FakeTextKatsRange } from '../../src/io/fake-kats-range.js';
import { FakeTableKatsRange } from '../../src/io/fake-kats-table.js';

describe('FakeTextKatsRange', () => {
  it('has kind="text"', () => {
    expect(new FakeTextKatsRange().kind).toBe('text');
  });

  it('starts empty by default', async () => {
    const r = new FakeTextKatsRange();
    expect(r.paragraphs).toEqual([]);
    expect(await r.getText()).toBe('');
    expect(r.dropdowns).toBeUndefined();
  });

  it('accepts initial paragraphs', async () => {
    const r = new FakeTextKatsRange(['a', 'b']);
    expect(r.paragraphs).toEqual(['a', 'b']);
    expect(await r.getText()).toBe('a\rb');
  });

  it('setParagraphs replaces content and clears any stored dropdowns', async () => {
    const r = new FakeTextKatsRange(['old']);
    await r.setDropdownsSeparated(
      { options: ['A'], defaultValue: 'A', underlined: true },
      ' ./. ',
      { options: ['B'], defaultValue: 'B', underlined: false },
    );
    expect(r.dropdowns).toBeDefined();
    await r.setParagraphs(['new1', 'new2']);
    expect(r.paragraphs).toEqual(['new1', 'new2']);
    expect(r.dropdowns).toBeUndefined();
  });

  it('getText joins with \\r (Word paragraph separator)', async () => {
    const r = new FakeTextKatsRange(['Lund den 24 april 2026', '', 'Ulrik Sjölin', 'Ers Titel']);
    expect(await r.getText()).toBe('Lund den 24 april 2026\r\rUlrik Sjölin\rErs Titel');
  });

  it('external mutation of input array is ignored (defensive copy)', () => {
    const input = ['a', 'b'];
    const r = new FakeTextKatsRange(input);
    input.push('c');
    expect(r.paragraphs).toEqual(['a', 'b']);
  });

  it('setDropdownsSeparated records the spec and clears paragraphs', async () => {
    const r = new FakeTextKatsRange(['old']);
    await r.setDropdownsSeparated(
      { options: ['Åsa', 'Björn'], defaultValue: 'Åsa', underlined: true },
      ' ./. ',
      { options: ['Östen'], defaultValue: 'Östen', underlined: false },
    );
    expect(r.paragraphs).toEqual([]);
    expect(r.dropdowns).toEqual({
      left: { options: ['Åsa', 'Björn'], defaultValue: 'Åsa', underlined: true },
      separator: ' ./. ',
      right: { options: ['Östen'], defaultValue: 'Östen', underlined: false },
    });
  });

  it('stored dropdown specs are defensive copies — mutating input does not affect recorded state', async () => {
    const r = new FakeTextKatsRange();
    const leftOpts = ['A'];
    await r.setDropdownsSeparated(
      { options: leftOpts, defaultValue: 'A', underlined: true },
      ' / ',
      { options: ['B'], defaultValue: 'B', underlined: false },
    );
    leftOpts.push('MUTATED');
    expect(r.dropdowns?.left.options).toEqual(['A']);
  });
});

describe('FakeTableKatsRange', () => {
  it('has kind="table"', () => {
    expect(new FakeTableKatsRange([[[''], ['']]]).kind).toBe('table');
  });

  it('reports row and column counts', () => {
    const t = new FakeTableKatsRange([
      [['a'], ['b'], ['c']],
      [['d'], ['e'], ['f']],
    ]);
    expect(t.rowCount).toBe(2);
    expect(t.columnCount).toBe(3);
  });

  it('getCellText joins paragraphs with \\r', async () => {
    const t = new FakeTableKatsRange([[['line1', 'line2'], ['single']]]);
    expect(await t.getCellText(0, 0)).toBe('line1\rline2');
    expect(await t.getCellText(0, 1)).toBe('single');
  });

  it('setCellParagraphs replaces a single cell without affecting others', async () => {
    const t = new FakeTableKatsRange([
      [['a'], ['b']],
      [['c'], ['d']],
    ]);
    await t.setCellParagraphs(1, 0, ['new']);
    expect(await t.getCellText(0, 0)).toBe('a');
    expect(await t.getCellText(0, 1)).toBe('b');
    expect(await t.getCellText(1, 0)).toBe('new');
    expect(await t.getCellText(1, 1)).toBe('d');
  });

  it('throws RangeError when row or col out of bounds', async () => {
    const t = new FakeTableKatsRange([[['a'], ['b']]]);
    await expect(t.getCellText(5, 0)).rejects.toBeInstanceOf(RangeError);
    await expect(t.getCellText(0, 5)).rejects.toBeInstanceOf(RangeError);
    await expect(t.setCellParagraphs(-1, 0, ['x'])).rejects.toBeInstanceOf(RangeError);
  });

  it('rejects non-rectangular input', () => {
    expect(() => new FakeTableKatsRange([[['a'], ['b']], [['c']]])).toThrow();
  });

  it('empty table has rowCount=0 and columnCount=0', () => {
    const t = new FakeTableKatsRange([]);
    expect(t.rowCount).toBe(0);
    expect(t.columnCount).toBe(0);
  });
});
