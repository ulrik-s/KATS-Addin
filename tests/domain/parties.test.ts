import { describe, it, expect } from 'vitest';
import { extractParties } from '../../src/domain/parties.js';

describe('extractParties — simple cases', () => {
  it('pulls left and right parties from a "./." separator on the first line', () => {
    const block = 'Åsa Östlund ./. Björn Bergendorff\n';
    const r = extractParties(block);
    expect(r.leftParty).toBe('Åsa Östlund');
    expect(r.rightParty).toBe(''); // no Motpart: line
  });

  it('pulls right party from a "Motpart:" line', () => {
    const block =
      'Åsa Östlund\n' + 'Åsa Östlund, 800101-1234\n' + 'Motpart: Björn Bergendorff, 700202-5678\n';
    const r = extractParties(block);
    expect(r.leftParty).toBe('Åsa Östlund');
    expect(r.rightParty).toBe('Björn Bergendorff');
  });

  it('returns empty parties for empty input', () => {
    expect(extractParties('')).toEqual({ leftParty: '', rightParty: '', allNames: [] });
    expect(extractParties('   \n\n  ')).toEqual({ leftParty: '', rightParty: '', allNames: [] });
  });

  it('treats whole first line as left party when no separator', () => {
    const r = extractParties('Åsa Östlund\nMotpart: Björn, 700202-5678\n');
    expect(r.leftParty).toBe('Åsa Östlund');
    expect(r.rightParty).toBe('Björn');
  });
});

describe('extractParties — name collection + dedup', () => {
  it('collects names from `NAME, NNNNNN-NNNN` lines + leftParty', () => {
    const block =
      'Åsa Östlund ./. Björn B.\n' +
      '\n' +
      'Åsa Östlund, 800101-1234\n' +
      'Björn Bergendorff, 700202-5678\n' +
      'Witness Person, 900303-9999\n';
    const r = extractParties(block);
    // "Björn B." from the header line has no pnr → not collected.
    expect(r.allNames).toEqual(['Åsa Östlund', 'Björn Bergendorff', 'Witness Person']);
  });

  it('dedupes case- and whitespace-insensitively', () => {
    const block =
      'ÅSA ÖSTLUND\n' + 'åsa östlund, 800101-1234\n' + '  Åsa   Östlund  , 800101-1234\n';
    const r = extractParties(block);
    // Only the first-seen form survives.
    expect(r.allNames).toEqual(['ÅSA ÖSTLUND']);
  });

  it('treats NFD and NFC forms as the same person', () => {
    const block =
      'Sjölin\n' + 'Sjölin, 800101-1234\n' + 'Sjo\u0308lin, 800101-1234\n' + 'SJÖLIN, 800101-1234';
    const r = extractParties(block);
    expect(r.allNames).toEqual(['Sjölin']);
  });

  it('ignores lines without personnummer (for name harvesting)', () => {
    const block =
      'Åsa ./. Björn\n' + 'Åsa, 800101-1234\n' + 'Björn Witness\n' + 'Björn, 700202-5678\n';
    const r = extractParties(block);
    expect(r.allNames).toEqual(['Åsa', 'Björn']);
    expect(r.allNames).not.toContain('Björn Witness');
  });

  it('strips leading "Motpart:" from a name with personnummer', () => {
    const block = 'Åsa ./. Björn\n' + 'Motpart: Björn Bergendorff, 700202-5678\n';
    const r = extractParties(block);
    expect(r.allNames).toContain('Björn Bergendorff');
    expect(r.allNames).not.toContain('Motpart: Björn Bergendorff');
  });
});

describe('extractParties — edge cases', () => {
  it('handles CRLF from Windows-authored blocks', () => {
    const block = 'Åsa ./. Björn\r\n' + 'Åsa, 800101-1234\r\n' + 'Motpart: Björn, 700202-5678\r\n';
    const r = extractParties(block);
    expect(r.leftParty).toBe('Åsa');
    expect(r.rightParty).toBe('Björn');
  });

  it('strips Chr(7) BEL control character', () => {
    const r = extractParties('Åsa\u0007 ./. Björn\n');
    expect(r.leftParty).toBe('Åsa');
  });

  it('NFC-normalizes leftParty and rightParty', () => {
    const r = extractParties('A\u0308ke\n' + 'Motpart: O\u0308sten, 700202-5678\n');
    expect(r.leftParty).toBe('Äke');
    expect(r.rightParty).toBe('Östen');
  });

  it('ignores malformed personnummer (4-digit year)', () => {
    const block = 'Åsa\n' + 'Åsa, 19800101-1234\n';
    const r = extractParties(block);
    // Nothing matches `NNNNNN-NNNN` strictly.
    expect(r.allNames).toEqual(['Åsa']);
  });

  it('handles an empty Motpart: line gracefully', () => {
    const r = extractParties('Åsa\nMotpart:\nÅsa, 800101-1234\n');
    expect(r.rightParty).toBe('');
  });

  it('strips trailing text after first comma for rightParty', () => {
    const r = extractParties('Åsa\nMotpart: Björn Bergendorff, 700202-5678, extra\n');
    expect(r.rightParty).toBe('Björn Bergendorff');
  });
});
