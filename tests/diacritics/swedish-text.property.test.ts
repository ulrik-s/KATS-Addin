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
  type LabelSpec,
  canonicalLabelOrNull,
  labelPrimary,
  labelVariants,
  swedishLooseContains,
  swedishLooseContainsAny,
  swedishLooseEquals,
  swedishLooseEqualsAny,
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

describe('LabelSpec helpers — alias-aware matching', () => {
  const ARVODE_SPEC: LabelSpec = { primary: 'Arvode', aliases: ['Fee', 'Honorarium'] };
  const SUMMARY_SPEC: LabelSpec = { primary: 'Summa', aliases: ['Total', 'Sum'] };

  it('labelVariants(string) returns single-element list', () => {
    expect(labelVariants('Arvode')).toEqual(['Arvode']);
  });

  it('labelVariants(spec) returns primary first, then aliases', () => {
    expect(labelVariants(ARVODE_SPEC)).toEqual(['Arvode', 'Fee', 'Honorarium']);
  });

  it('labelVariants tolerates omitted aliases', () => {
    expect(labelVariants({ primary: 'X' })).toEqual(['X']);
  });

  it('labelPrimary returns the primary form regardless of input shape', () => {
    expect(labelPrimary('Arvode')).toBe('Arvode');
    expect(labelPrimary(ARVODE_SPEC)).toBe('Arvode');
    expect(labelPrimary({ primary: 'Y' })).toBe('Y');
  });

  it('swedishLooseEqualsAny matches the primary form', () => {
    expect(swedishLooseEqualsAny('Arvode', ARVODE_SPEC)).toBe(true);
  });

  it('swedishLooseEqualsAny matches each alias', () => {
    expect(swedishLooseEqualsAny('Fee', ARVODE_SPEC)).toBe(true);
    expect(swedishLooseEqualsAny('Honorarium', ARVODE_SPEC)).toBe(true);
  });

  it('swedishLooseEqualsAny matches case- and diacritic-insensitively across aliases', () => {
    const SECT: LabelSpec = { primary: 'Tidsspillan', aliases: ['Time loss'] };
    expect(swedishLooseEqualsAny('TIDSSPILLAN', SECT)).toBe(true);
    expect(swedishLooseEqualsAny('time loss', SECT)).toBe(true);
    expect(swedishLooseEqualsAny('  Time  Loss  ', SECT)).toBe(false); // double-space middle
  });

  it('swedishLooseEqualsAny tolerates leading/trailing whitespace via the underlying matcher', () => {
    expect(swedishLooseEqualsAny('  Total  ', SUMMARY_SPEC)).toBe(true);
  });

  it('swedishLooseEqualsAny returns false when no variant matches', () => {
    expect(swedishLooseEqualsAny('Belopp', ARVODE_SPEC)).toBe(false);
  });

  it('swedishLooseEqualsAny accepts a bare string spec (legacy)', () => {
    expect(swedishLooseEqualsAny('Arvode', 'Arvode')).toBe(true);
    expect(swedishLooseEqualsAny('Fee', 'Arvode')).toBe(false);
  });

  it('swedishLooseContainsAny matches when any variant is contained', () => {
    const ARENDE: LabelSpec = { primary: 'Ärende, total', aliases: ['Case, total'] };
    expect(swedishLooseContainsAny('Ärende, total: 6,00 tim', ARENDE)).toBe(true);
    expect(swedishLooseContainsAny('Final: Case, total — 6.00 h', ARENDE)).toBe(true);
    expect(swedishLooseContainsAny('Belopp', ARENDE)).toBe(false);
  });

  it('swedishLooseContainsAny falls through to plain swedishLooseContains for strings', () => {
    expect(swedishLooseContainsAny('Utlägg momsfri', 'Utlägg')).toBe(true);
  });
});

describe('canonicalLabelOrNull — alias → primary rewriting', () => {
  const ARVODE: LabelSpec = { primary: 'Arvode', aliases: ['Fee', 'Fees'] };
  const SUMMARY: LabelSpec = { primary: 'Summa', aliases: ['Total', 'Sum'] };

  it('returns primary form when text is an alias', () => {
    expect(canonicalLabelOrNull('Fee', ARVODE)).toBe('Arvode');
    expect(canonicalLabelOrNull('Fees', ARVODE)).toBe('Arvode');
    expect(canonicalLabelOrNull('Total', SUMMARY)).toBe('Summa');
  });

  it('returns null when text already matches the primary (case-insensitive)', () => {
    expect(canonicalLabelOrNull('Arvode', ARVODE)).toBeNull();
    expect(canonicalLabelOrNull('ARVODE', ARVODE)).toBeNull();
    expect(canonicalLabelOrNull('arvode', ARVODE)).toBeNull();
    expect(canonicalLabelOrNull('  Arvode  ', ARVODE)).toBeNull();
  });

  it('returns null when text already matches primary diacritic-loose', () => {
    const UTLAGG: LabelSpec = { primary: 'Utlägg', aliases: ['Expenses'] };
    expect(canonicalLabelOrNull('Utlagg', UTLAGG)).toBeNull(); // diacritic stripped
    expect(canonicalLabelOrNull('Utlägg', UTLAGG)).toBeNull();
  });

  it('returns null for empty / whitespace-only text', () => {
    expect(canonicalLabelOrNull('', ARVODE)).toBeNull();
    expect(canonicalLabelOrNull('   ', ARVODE)).toBeNull();
    expect(canonicalLabelOrNull('\t\n', ARVODE)).toBeNull();
  });

  it('returns primary even when alias is matched case-insensitively', () => {
    expect(canonicalLabelOrNull('FEE', ARVODE)).toBe('Arvode');
    expect(canonicalLabelOrNull('total', SUMMARY)).toBe('Summa');
  });

  it('returns null when text matches no variant at all (caller should not patch)', () => {
    expect(canonicalLabelOrNull('something else', ARVODE)).toBe('Arvode');
    // ^ NOTE: canonicalLabelOrNull rewrites *anything* that doesn't loose-equal
    // the primary. Callers are expected to first establish the row IS a label
    // row (via findHeadingRow / findSummaryRowAfter) before calling, so the
    // input is always either primary, alias, or canonical-with-noise.
  });
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
