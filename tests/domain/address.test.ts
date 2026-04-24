import { describe, it, expect } from 'vitest';
import {
  extractNonEmptyLines,
  extractPostort,
  normalizeAddressText,
  parseAddressBlock,
  titleCaseCity,
} from '../../src/domain/address.js';

describe('normalizeAddressText', () => {
  it('converts CRLF to LF', () => {
    expect(normalizeAddressText('a\r\nb\r\nc')).toBe('a\nb\nc');
  });

  it('converts lone CR to LF', () => {
    expect(normalizeAddressText('a\rb\rc')).toBe('a\nb\nc');
  });

  it('converts VT (Chr(11)) to LF', () => {
    expect(normalizeAddressText('a\u000bb')).toBe('a\nb');
  });

  it('strips the Chr(7) BEL control char seen in legacy Word docs', () => {
    expect(normalizeAddressText('a\u0007b')).toBe('ab');
  });

  it('NFC-normalizes diacritics', () => {
    expect(normalizeAddressText('Sjo\u0308lin')).toBe('Sjölin');
  });

  it('trims trailing whitespace per line but preserves empty lines', () => {
    expect(normalizeAddressText('a  \n\nb\t\nc')).toBe('a\n\nb\nc');
  });
});

describe('extractNonEmptyLines', () => {
  it('returns only non-blank lines', () => {
    expect(extractNonEmptyLines('a\n\nb\n\n\nc')).toEqual(['a', 'b', 'c']);
  });

  it('trims each line', () => {
    expect(extractNonEmptyLines('   a   \n  b  ')).toEqual(['a', 'b']);
  });

  it('handles completely empty input', () => {
    expect(extractNonEmptyLines('')).toEqual([]);
    expect(extractNonEmptyLines('   \n\n  \n')).toEqual([]);
  });
});

describe('titleCaseCity', () => {
  it('capitalizes first letter of each word, lowercases the rest', () => {
    expect(titleCaseCity('malmö')).toBe('Malmö');
    expect(titleCaseCity('STOCKHOLM')).toBe('Stockholm');
    expect(titleCaseCity('brÖndby strand')).toBe('Bröndby Strand');
  });

  it('trims and collapses internal whitespace', () => {
    expect(titleCaseCity('  malmö   city  ')).toBe('Malmö City');
  });

  it('handles Swedish diacritics correctly', () => {
    expect(titleCaseCity('ÅSA')).toBe('Åsa');
    expect(titleCaseCity('ängelholm')).toBe('Ängelholm');
    expect(titleCaseCity('örebro')).toBe('Örebro');
  });

  it('NFC-normalizes input before casing', () => {
    expect(titleCaseCity('malmo\u0308')).toBe('Malmö');
  });
});

describe('extractPostort', () => {
  it('finds city from "### ## CITY" line', () => {
    expect(extractPostort('Box 847\n201 24 Malmö')).toBe('Malmö');
  });

  it('finds city with multiple spaces between digits', () => {
    expect(extractPostort('201  24   Malmö')).toBe('Malmö');
  });

  it('title-cases the extracted city', () => {
    expect(extractPostort('123 45 stockholm')).toBe('Stockholm');
    expect(extractPostort('123 45 BRÖNDBY STRAND')).toBe('Bröndby Strand');
  });

  it('returns empty when no postcode line present', () => {
    expect(extractPostort('Tingsrätten\nBox 12')).toBe('');
  });

  it('ignores lines that look similar but miss the pattern', () => {
    expect(extractPostort('20124 Malmö')).toBe(''); // missing space
    expect(extractPostort('201 24Malmö')).toBe(''); // missing space before city
  });

  it('picks the first matching line when multiple exist', () => {
    expect(extractPostort('201 24 Malmö\n789 01 Alfaville')).toBe('Malmö');
  });

  it('tolerates leading/trailing whitespace on the line', () => {
    expect(extractPostort('   201 24 Malmö   ')).toBe('Malmö');
  });

  it('works for city names with diacritics', () => {
    expect(extractPostort('391 33 kalmär')).toBe('Kalmär');
    expect(extractPostort('901 01 UMEÅ')).toBe('Umeå');
  });
});

describe('parseAddressBlock', () => {
  it('returns first non-empty line and postort', () => {
    const block = 'Tingsrätten i Malmö\nBox 847\n201 24 Malmö';
    expect(parseAddressBlock(block)).toEqual({
      firstLine: 'Tingsrätten i Malmö',
      postort: 'Malmö',
    });
  });

  it('handles missing postcode — firstLine only', () => {
    expect(parseAddressBlock('Hyresnämnden i Lund\nattn. ordföranden')).toEqual({
      firstLine: 'Hyresnämnden i Lund',
      postort: '',
    });
  });

  it('ignores initial blank lines when picking first line', () => {
    expect(parseAddressBlock('\n\nKronofogden\n121 26 Stockholm')).toEqual({
      firstLine: 'Kronofogden',
      postort: 'Stockholm',
    });
  });

  it('handles CRLF from a Windows-authored block', () => {
    expect(parseAddressBlock('Domstolen\r\nBox 1\r\n123 45 Lund')).toEqual({
      firstLine: 'Domstolen',
      postort: 'Lund',
    });
  });

  it('empty input → empty firstLine + empty postort', () => {
    expect(parseAddressBlock('')).toEqual({ firstLine: '', postort: '' });
    expect(parseAddressBlock('   \n   \n')).toEqual({ firstLine: '', postort: '' });
  });

  it('strips Chr(7) control char that Word sometimes inserts', () => {
    expect(parseAddressBlock('Tingsrätten\u0007 i Malmö\n201 24 Malmö')).toEqual({
      firstLine: 'Tingsrätten i Malmö',
      postort: 'Malmö',
    });
  });
});
