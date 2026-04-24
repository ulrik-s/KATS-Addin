import { describe, it, expect } from 'vitest';
import {
  buildSignatureParagraphs,
  resolveSignatureCity,
  SIGNATURE_FALLBACK_CITY,
} from '../../src/domain/signature.js';

describe('resolveSignatureCity', () => {
  it('prefers postort when non-empty', () => {
    expect(resolveSignatureCity('Malmö', 'Lund')).toBe('Malmö');
  });

  it('falls back to userCity when postort is undefined', () => {
    expect(resolveSignatureCity(undefined, 'Lund')).toBe('Lund');
  });

  it('falls back to userCity when postort is empty', () => {
    expect(resolveSignatureCity('', 'Lund')).toBe('Lund');
  });

  it('falls back to userCity when postort is only whitespace', () => {
    expect(resolveSignatureCity('   ', 'Lund')).toBe('Lund');
  });

  it('falls back to the constant when both postort and userCity are empty', () => {
    expect(resolveSignatureCity('', '')).toBe(SIGNATURE_FALLBACK_CITY);
    expect(resolveSignatureCity(undefined, '')).toBe(SIGNATURE_FALLBACK_CITY);
  });

  it('respects a custom fallback', () => {
    expect(resolveSignatureCity(undefined, '', 'Stockholm')).toBe('Stockholm');
  });

  it('trims surrounding whitespace on postort and userCity', () => {
    expect(resolveSignatureCity('  Göteborg  ', 'Lund')).toBe('Göteborg');
    expect(resolveSignatureCity(undefined, '  Lund  ')).toBe('Lund');
  });
});

describe('buildSignatureParagraphs', () => {
  const FIXED_DATE = new Date(2026, 3, 24); // 24 april 2026

  it('produces exactly four paragraphs in the documented order', () => {
    const result = buildSignatureParagraphs({
      date: FIXED_DATE,
      city: 'Lund',
      fullName: 'Ulrik Sjölin',
      title: 'Ers Kjeserliga Överhöghet',
    });
    expect(result).toEqual([
      'Lund den 24 april 2026',
      '',
      'Ulrik Sjölin',
      'Ers Kjeserliga Överhöghet',
    ]);
  });

  it('second paragraph is always empty (blank line in Word)', () => {
    const result = buildSignatureParagraphs({
      date: FIXED_DATE,
      city: 'Lund',
      fullName: 'X',
      title: 'Y',
    });
    expect(result[1]).toBe('');
  });

  it('NFC-normalizes city / name / title', () => {
    // Input has NFD "ö" (o + combining diaeresis). Output must be NFC.
    const result = buildSignatureParagraphs({
      date: FIXED_DATE,
      city: 'Go\u0308teborg',
      fullName: 'Ulrik Sjo\u0308lin',
      title: 'O\u0308verho\u0308ghet',
    });
    expect(result[0]).toBe('Göteborg den 24 april 2026');
    expect(result[2]).toBe('Ulrik Sjölin');
    expect(result[3]).toBe('Överhöghet');
    // Every output string is idempotent under .normalize('NFC').
    for (const p of result) expect(p).toBe(p.normalize('NFC'));
  });

  it('format matches the VBA RenderSignatureBlock output exactly', () => {
    // VBA: City & " den " & Day & " " & month & " " & Year & vbCr & vbCr & name & vbCr & title
    // In our model: paragraphs joined by \r give the VBA text.
    const result = buildSignatureParagraphs({
      date: new Date(2026, 0, 1),
      city: 'Malmö',
      fullName: 'Måns Bergendorff',
      title: 'Advokat',
    });
    expect(result.join('\r')).toBe('Malmö den 1 januari 2026\r\rMåns Bergendorff\rAdvokat');
  });
});
