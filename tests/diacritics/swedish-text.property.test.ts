/**
 * Extended diacritic coverage — systematic pairs of real-world needles /
 * haystacks that must match. These are the exact strings that tripped up
 * VBA before the loose-regex fix (commits 2591a59, f309108, 86d0ca6).
 *
 * If any of these fail, something in `swedish-text.ts` has regressed and
 * document transformations will silently break on legacy-encoded input.
 */
import { describe, it, expect } from 'vitest';
import {
  swedishLooseContains,
  swedishLooseEquals,
  normalizeKey,
  nfc,
} from '../../src/domain/swedish-text.js';

// needle → list of strings that must all loose-match as containing it
const LOOSE_CONTAINS_CORPUS: Readonly<Record<string, readonly string[]>> = {
  förhandling: [
    'förhandling',
    'FÖRHANDLING',
    'Förhandling',
    'forhandling', // diacritic stripped
    'f0rhandling', // digit substitution
    'fXrhandling', // any char
    'medverkat vid förhandling från',
    'medverkat vid huvudförhandling från',
    'fo\u0308rhandling', // NFD
    'FO\u0308RHANDLING', // NFD + uppercase
  ],
  Utlägg: [
    'Utlägg',
    'utlagg',
    'UTLÄGG',
    'Utl.gg', // legacy wildcard
    'Utlägg momsfri',
    'Utla\u0308gg', // NFD
  ],
  'Ärende, total': ['Ärende, total', 'Arende, total', '.rende, total', 'ÄRENDE, TOTAL'],
  'Tidsspillan övrig tid': [
    'Tidsspillan övrig tid',
    'Tidsspillan ovrig tid',
    'Tidsspillan .vrig tid',
    'TIDSSPILLAN ÖVRIG TID',
  ],
  'enligt taxa': ['enligt taxa', 'ENLIGT TAXA', 'Enligt taxa', 'something enligt taxa continues'],
  Milersättning: ['Milersättning', 'milersattning', 'Milers.ttning', 'MILERSÄTTNING'],
};

// needle → list of strings that must NOT loose-match
const MUST_NOT_MATCH: Readonly<Record<string, readonly string[]>> = {
  förhandling: ['arvode', 'utlägg', 'handling', 'utredning'],
  Utlägg: ['arvode', 'moms', 'Utredning'],
  'Ärende, total': ['Ärende total', 'Ärende: total', 'total, Ärende'],
};

describe('diacritics — loose contains corpus', () => {
  for (const [needle, haystacks] of Object.entries(LOOSE_CONTAINS_CORPUS)) {
    describe(`needle: "${needle}"`, () => {
      for (const hay of haystacks) {
        it(`matches "${hay}"`, () => {
          expect(swedishLooseContains(hay, needle)).toBe(true);
        });
      }
    });
  }
});

describe('diacritics — must-not-match corpus', () => {
  for (const [needle, haystacks] of Object.entries(MUST_NOT_MATCH)) {
    describe(`needle: "${needle}"`, () => {
      for (const hay of haystacks) {
        it(`does not match "${hay}"`, () => {
          expect(swedishLooseContains(hay, needle)).toBe(false);
        });
      }
    });
  }
});

describe('diacritics — heading equality (used in VBA RegexEqualsLoose call sites)', () => {
  const cases: readonly (readonly [string, string, boolean])[] = [
    ['Utlägg', 'Utlägg', true],
    ['  Utlägg  ', 'Utlägg', true],
    ['Utlagg', 'Utlägg', true],
    ['Utl.gg', 'Utlägg', true],
    ['Utlägg momsfri', 'Utlägg', false],
    ['Belopp exkl. moms', 'Belopp exkl. moms', true],
    ['  belopp exkl. moms  ', 'Belopp exkl. moms', true],
    ['Moms (25%)', 'Moms (25%)', true],
    ['Moms 25%', 'Moms (25%)', false],
  ];

  for (const [hay, needle, expected] of cases) {
    it(`"${hay}" ≡ "${needle}" → ${String(expected)}`, () => {
      expect(swedishLooseEquals(hay, needle)).toBe(expected);
    });
  }
});

describe('diacritics — dedup key stability (party-name style)', () => {
  // Different Unicode forms of the same human-readable name must produce
  // the same dedup key — used by YttrandeParter to dedupe extracted names.
  const equivalents: readonly (readonly string[])[] = [
    ['Björn Östlund', 'BJÖRN ÖSTLUND', 'björn östlund', 'bjo\u0308rn o\u0308stlund'],
    ['  Åke   Ärlig  ', 'Åke Ärlig', 'ÅKE ÄRLIG'],
    ['Sjölin, Ulrik', 'SJÖLIN, ULRIK', 'Sjo\u0308lin, Ulrik'],
  ];

  for (const group of equivalents) {
    it(`group { ${group.join(' | ')} } normalizes identically`, () => {
      const keys = group.map(normalizeKey);
      const unique = new Set(keys);
      expect(unique.size).toBe(1);
    });
  }
});

describe('diacritics — output must always be NFC', () => {
  // Processors that emit text into Word should never emit NFD —
  // otherwise downstream re-reads fail loose matching.
  it('nfc() on NFD input produces single-codepoint characters', () => {
    const decomposed = 'fo\u0308rhandling';
    const composed = nfc(decomposed);
    expect(composed).toBe('förhandling');
    // Single codepoint ö, not o + U+0308
    expect(composed.charCodeAt(1)).toBe(0xf6);
  });

  it('nfc() is idempotent', () => {
    const s = 'Åke Ärlig och Björn Östlund';
    expect(nfc(nfc(s))).toBe(nfc(s));
  });
});
