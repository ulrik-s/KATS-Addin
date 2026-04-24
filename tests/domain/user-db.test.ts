import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  expandIdentityCandidate,
  loadUserDatabase,
  normalizeLookupKey,
  resolveCurrentUser,
  type UserDatabase,
} from '../../src/domain/user-db.js';
import { USERS } from '../../src/domain/users.data.js';

function makeDb(): UserDatabase {
  return loadUserDatabase({
    defaultUserKey: 'default',
    users: [
      {
        key: 'default',
        shortName: 'Default',
        fullName: 'Default Person',
        mileageKrPerKm: 0,
        title: 'Fallback',
        city: 'Lund',
        aliases: [],
      },
      {
        key: 'ulrik',
        shortName: 'Ulrik',
        fullName: 'Ulrik Sjölin',
        mileageKrPerKm: 483.99,
        title: 'Ers Kjeserliga Överhöghet',
        city: 'Utopia',
        aliases: ['ulriksjolin', 'ulriksjoelin'],
      },
      {
        key: 'mans',
        shortName: 'Måns',
        fullName: 'Måns Bergendorff',
        mileageKrPerKm: 37,
        title: 'Advokat',
        city: 'Malmö',
        aliases: [],
      },
    ],
  });
}

describe('loadUserDatabase', () => {
  it('parses valid data', () => {
    const db = makeDb();
    expect(db.users).toHaveLength(3);
    expect(db.defaultUserKey).toBe('default');
  });

  it('rejects missing defaultUserKey user', () => {
    expect(() =>
      loadUserDatabase({
        defaultUserKey: 'ghost',
        users: [
          {
            key: 'a',
            shortName: 'A',
            fullName: 'A',
            mileageKrPerKm: 0,
            title: 'T',
            city: 'C',
            aliases: [],
          },
        ],
      }),
    ).toThrow(ZodError);
  });

  it('rejects duplicate keys', () => {
    expect(() =>
      loadUserDatabase({
        defaultUserKey: 'a',
        users: [
          {
            key: 'a',
            shortName: 'A',
            fullName: 'A',
            mileageKrPerKm: 0,
            title: 'T',
            city: 'C',
            aliases: [],
          },
          {
            key: 'a',
            shortName: 'B',
            fullName: 'B',
            mileageKrPerKm: 0,
            title: 'T',
            city: 'C',
            aliases: [],
          },
        ],
      }),
    ).toThrow(ZodError);
  });

  it('rejects empty users array', () => {
    expect(() => loadUserDatabase({ defaultUserKey: 'x', users: [] })).toThrow(ZodError);
  });

  it('rejects negative mileage', () => {
    expect(() =>
      loadUserDatabase({
        defaultUserKey: 'a',
        users: [
          {
            key: 'a',
            shortName: 'A',
            fullName: 'A',
            mileageKrPerKm: -1,
            title: 'T',
            city: 'C',
            aliases: [],
          },
        ],
      }),
    ).toThrow(ZodError);
  });
});

describe('normalizeLookupKey', () => {
  it('lowercases', () => {
    expect(normalizeLookupKey('ULRIK')).toBe('ulrik');
  });

  it('strips Swedish diacritics (å/ä/ö → a/a/o)', () => {
    expect(normalizeLookupKey('Sjölin')).toBe('sjolin');
    expect(normalizeLookupKey('Måns')).toBe('mans');
    expect(normalizeLookupKey('Åke')).toBe('ake');
    expect(normalizeLookupKey('Ärlig')).toBe('arlig');
  });

  it('strips NFD combining marks', () => {
    expect(normalizeLookupKey('Sjo\u0308lin')).toBe('sjolin');
  });

  it('strips punctuation and whitespace', () => {
    expect(normalizeLookupKey('Ulrik Sjölin')).toBe('ulriksjolin');
    expect(normalizeLookupKey('ulrik.sjolin')).toBe('ulriksjolin');
    expect(normalizeLookupKey('ulrik_sjolin')).toBe('ulriksjolin');
    expect(normalizeLookupKey('DOMAIN\\ulrik')).toBe('domainulrik');
  });

  it('strips European accents beyond Swedish', () => {
    expect(normalizeLookupKey('André')).toBe('andre');
    expect(normalizeLookupKey('Müller')).toBe('muller');
    expect(normalizeLookupKey('José')).toBe('jose');
  });
});

describe('expandIdentityCandidate', () => {
  it('returns empty for empty / whitespace', () => {
    expect(expandIdentityCandidate('')).toEqual([]);
    expect(expandIdentityCandidate('   ')).toEqual([]);
  });

  it('returns the value itself when it is plain', () => {
    expect(expandIdentityCandidate('ulrik')).toEqual(['ulrik']);
  });

  it('extracts username after a backslash (Windows DOMAIN\\user)', () => {
    expect(expandIdentityCandidate('CORP\\ulrik')).toEqual(['CORP\\ulrik', 'ulrik']);
  });

  it('extracts username after a forward slash', () => {
    expect(expandIdentityCandidate('corp/ulrik')).toEqual(['corp/ulrik', 'ulrik']);
  });

  it('extracts local-part of an email', () => {
    expect(expandIdentityCandidate('ulrik@example.com')).toEqual(['ulrik@example.com', 'ulrik']);
  });

  it('trims surrounding whitespace', () => {
    expect(expandIdentityCandidate('  ulrik  ')).toEqual(['ulrik']);
  });
});

describe('resolveCurrentUser', () => {
  const db = makeDb();

  it('exact key match returns that user', () => {
    const u = resolveCurrentUser(db, ['ulrik']);
    expect(u.key).toBe('ulrik');
  });

  it('case-insensitive key match', () => {
    expect(resolveCurrentUser(db, ['ULRIK']).key).toBe('ulrik');
    expect(resolveCurrentUser(db, ['Ulrik']).key).toBe('ulrik');
  });

  it('strips diacritics from the candidate when matching key', () => {
    // "Måns" normalized becomes "mans" which matches the "mans" key.
    expect(resolveCurrentUser(db, ['Måns']).key).toBe('mans');
    expect(resolveCurrentUser(db, ['måns']).key).toBe('mans');
  });

  it('matches against full-name-derived lookup keys', () => {
    // "Ulrik Sjölin" → "ulriksjolin" (collapsed + normalized)
    expect(resolveCurrentUser(db, ['Ulrik Sjölin']).key).toBe('ulrik');
    expect(resolveCurrentUser(db, ['UlrikSjolin']).key).toBe('ulrik');
  });

  it('matches against explicit aliases', () => {
    expect(resolveCurrentUser(db, ['ulriksjoelin']).key).toBe('ulrik');
  });

  it('strips DOMAIN\\ prefix before matching', () => {
    expect(resolveCurrentUser(db, ['CORP\\ulrik']).key).toBe('ulrik');
  });

  it('strips email suffix before matching', () => {
    expect(resolveCurrentUser(db, ['ulrik@mga.se']).key).toBe('ulrik');
  });

  it('walks multiple candidates in order', () => {
    expect(resolveCurrentUser(db, ['', '  ', 'ulrik']).key).toBe('ulrik');
  });

  it('falls back to defaultUserKey when nothing matches', () => {
    expect(resolveCurrentUser(db, ['totally-unknown']).key).toBe('default');
  });

  it('falls back to default when candidates list is empty', () => {
    expect(resolveCurrentUser(db, []).key).toBe('default');
  });
});

describe('USERS (real user data from MoGUser.bas)', () => {
  it('validates and loads without error', () => {
    expect(USERS.users).toHaveLength(10);
    expect(USERS.defaultUserKey).toBe('default');
  });

  it('resolves "ulrik" to the Ulrik Sjölin entry', () => {
    const u = resolveCurrentUser(USERS, ['ulrik']);
    expect(u.fullName).toBe('Ulrik Sjölin');
    expect(u.mileageKrPerKm).toBe(483.99);
    expect(u.city).toBe('Utopia');
    expect(u.title).toBe('Ers Kjeserliga Överhöghet');
  });

  it('resolves by alias "ulriksjoelin"', () => {
    const u = resolveCurrentUser(USERS, ['ulriksjoelin']);
    expect(u.key).toBe('ulrik');
  });

  it('resolves "mans" via diacritic-stripped Måns', () => {
    const u = resolveCurrentUser(USERS, ['Måns']);
    expect(u.key).toBe('mans');
    expect(u.fullName).toBe('Måns Bergendorff');
  });

  it('resolves to "default" on unknown username', () => {
    const u = resolveCurrentUser(USERS, ['nobody']);
    expect(u.key).toBe('default');
    expect(u.city).toBe('Lund');
  });
});
