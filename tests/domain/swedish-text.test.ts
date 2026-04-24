import { describe, it, expect } from 'vitest';
import {
  nfc,
  swedishEquals,
  swedishLoosePattern,
  looseRegex,
  swedishLooseContains,
  swedishLooseEquals,
  normalizeKey,
} from '../../src/domain/swedish-text.js';

describe('nfc', () => {
  it('is a no-op on already-NFC text', () => {
    expect(nfc('förhandling')).toBe('förhandling');
  });

  it('composes NFD into NFC', () => {
    const nfd = 'fo\u0308rhandling'; // o + combining diaeresis
    const composed = nfc(nfd);
    expect(composed).toBe('förhandling');
    expect(composed).toHaveLength(11);
    expect(nfd).toHaveLength(12);
  });

  it('handles empty string', () => {
    expect(nfc('')).toBe('');
  });

  it('leaves non-diacritic text untouched', () => {
    expect(nfc('hello world 123')).toBe('hello world 123');
  });
});

describe('swedishEquals', () => {
  it('treats NFC and NFD as equal', () => {
    expect(swedishEquals('förhandling', 'fo\u0308rhandling')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(swedishEquals('Förhandling', 'FÖRHANDLING')).toBe(true);
    expect(swedishEquals('Ärende', 'ärende')).toBe(true);
  });

  it('distinguishes different words', () => {
    expect(swedishEquals('arvode', 'utlägg')).toBe(false);
  });
});

describe('swedishLoosePattern', () => {
  it('turns each Swedish diacritic into `.`', () => {
    expect(swedishLoosePattern('förhandling')).toBe('f.rhandling');
    expect(swedishLoosePattern('Utlägg')).toBe('Utl.gg');
    expect(swedishLoosePattern('Ärende, total')).toBe('.rende, total');
    expect(swedishLoosePattern('Tidsspillan övrig tid')).toBe('Tidsspillan .vrig tid');
  });

  it('handles all six diacritic forms', () => {
    expect(swedishLoosePattern('åäöÅÄÖ')).toBe('......');
  });

  it('escapes regex special characters', () => {
    expect(swedishLoosePattern('a.b')).toBe('a\\.b');
    expect(swedishLoosePattern('(foo)')).toBe('\\(foo\\)');
    expect(swedishLoosePattern('a*b+c?')).toBe('a\\*b\\+c\\?');
    expect(swedishLoosePattern('$^|')).toBe('\\$\\^\\|');
    expect(swedishLoosePattern('[x]')).toBe('\\[x\\]');
    expect(swedishLoosePattern('\\')).toBe('\\\\');
  });

  it('leaves plain ASCII untouched', () => {
    expect(swedishLoosePattern('hello world 42')).toBe('hello world 42');
  });

  it('normalizes NFD input before building pattern', () => {
    expect(swedishLoosePattern('fo\u0308rhandling')).toBe('f.rhandling');
  });
});

describe('swedishLooseContains', () => {
  it('matches identical diacritic strings', () => {
    expect(swedishLooseContains('förhandling', 'förhandling')).toBe(true);
  });

  it('matches when source has diacritics stripped', () => {
    // Legacy encoding accidents: "förhandling" written as "forhandling"
    expect(swedishLooseContains('forhandling', 'förhandling')).toBe(true);
    expect(swedishLooseContains('Utlagg', 'Utlägg')).toBe(true);
    expect(swedishLooseContains('Arende, total', 'Ärende, total')).toBe(true);
  });

  it('matches any wildcard char at diacritic positions', () => {
    expect(swedishLooseContains('f0rhandling', 'förhandling')).toBe(true);
    expect(swedishLooseContains('f?rhandling', 'förhandling')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(swedishLooseContains('FÖRHANDLING', 'förhandling')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(swedishLooseContains('arvode', 'förhandling')).toBe(false);
  });

  it('treats NFD input as NFC for matching', () => {
    const nfd = 'fo\u0308rhandling';
    expect(swedishLooseContains(nfd, 'förhandling')).toBe(true);
  });

  it('respects regex special chars as literals', () => {
    // "foo.bar" in needle should only match literal "."
    expect(swedishLooseContains('foo.bar', 'foo.bar')).toBe(true);
    expect(swedishLooseContains('fooXbar', 'foo.bar')).toBe(false);
  });

  it('empty needle matches anything', () => {
    expect(swedishLooseContains('anything', '')).toBe(true);
    expect(swedishLooseContains('', '')).toBe(true);
  });

  it('empty haystack with non-empty needle does not match', () => {
    expect(swedishLooseContains('', 'förhandling')).toBe(false);
  });
});

describe('swedishLooseEquals', () => {
  it('anchors match to full string', () => {
    expect(swedishLooseEquals('Utlägg', 'Utlägg')).toBe(true);
    expect(swedishLooseEquals('Utlägg extra', 'Utlägg')).toBe(false);
    expect(swedishLooseEquals('extra Utlägg', 'Utlägg')).toBe(false);
  });

  it('tolerates leading/trailing whitespace', () => {
    expect(swedishLooseEquals('  Utlägg  ', 'Utlägg')).toBe(true);
    expect(swedishLooseEquals('\tUtlägg\n', 'Utlägg')).toBe(true);
  });

  it('applies loose diacritic matching', () => {
    expect(swedishLooseEquals('Utlagg', 'Utlägg')).toBe(true);
  });
});

describe('normalizeKey', () => {
  it('lowercases', () => {
    expect(normalizeKey('Ulrik Sjölin')).toBe('ulrik sjölin');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeKey('  foo  ')).toBe('foo');
  });

  it('collapses internal whitespace runs', () => {
    expect(normalizeKey('foo   bar\t\tbaz')).toBe('foo bar baz');
  });

  it('normalizes NFD to NFC before keying', () => {
    expect(normalizeKey('sjo\u0308lin')).toBe('sjölin');
  });

  it('preserves diacritics (does not strip them)', () => {
    expect(normalizeKey('Åke Ärlig')).toBe('åke ärlig');
  });

  it('deduplication example — same human name, different Unicode forms', () => {
    expect(normalizeKey('Björn  Östlund')).toBe(normalizeKey('bjo\u0308rn o\u0308stlund'));
  });
});

describe('looseRegex', () => {
  it('compiles to a RegExp', () => {
    expect(looseRegex('förhandling')).toBeInstanceOf(RegExp);
  });

  it('is case-insensitive by default', () => {
    expect(looseRegex('foo').test('FOO')).toBe(true);
  });

  it('accepts custom flags', () => {
    const r = looseRegex('foo', 'g');
    const hits = 'foo foo'.match(r);
    expect(hits).toHaveLength(2);
  });
});
