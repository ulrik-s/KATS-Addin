import { z } from 'zod';

/**
 * User DB ported from VBA `MoGUser.bas`.
 *
 * Identity resolution lives here (not in the Signatur processor) because
 * every processor that writes user-attributed output (SIGNATUR,
 * YTTRANDE_SIGNATUR, future: letter headers) needs the same lookup.
 *
 * Diacritic handling is *lookup-asymmetric*:
 *   - Display fields (fullName, title, city) preserve å/ä/ö.
 *   - Lookup keys are stripped to ASCII (`normalizeLookupKey`) because OS
 *     environment variables are often ASCII-only or re-encoded in ways
 *     that lose the diacritics.
 */

export const katsUserSchema = z.object({
  /** Primary key; unique across the DB. VBA: `UName`. */
  key: z.string().min(1),
  shortName: z.string().min(1),
  fullName: z.string().min(1),
  /** kr/km mileage reimbursement rate. */
  mileageKrPerKm: z.number().nonnegative(),
  title: z.string().min(1),
  /** Default city used for signature blocks when MOTTAGARE did not run. */
  city: z.string().min(1),
  /** Extra lookup aliases. VBA: `MatchKeys`, semicolon-separated. */
  aliases: z.array(z.string()).readonly(),
});
export type KatsUser = z.infer<typeof katsUserSchema>;

export const userDatabaseSchema = z
  .object({
    defaultUserKey: z.string().min(1),
    users: z.array(katsUserSchema).min(1),
  })
  .refine(
    (db) => db.users.some((u) => u.key === db.defaultUserKey),
    (db) => ({ message: `defaultUserKey "${db.defaultUserKey}" not present in users` }),
  )
  .refine((db) => new Set(db.users.map((u) => u.key)).size === db.users.length, {
    message: 'user keys must be unique',
  });
export type UserDatabase = z.infer<typeof userDatabaseSchema>;

/** Parse + validate raw data into a UserDatabase. Throws ZodError on bad input. */
export function loadUserDatabase(raw: unknown): UserDatabase {
  return userDatabaseSchema.parse(raw);
}

/**
 * Strip to ASCII-lowercase-alnum for OS-username lookup.
 *
 * Decomposes to NFD, drops combining marks (covers å→a, ä→a, ö→o, plus
 * French/Spanish/German accents), lowercases, then drops anything outside
 * `[a-z0-9]`. Intentionally *different* from `normalizeKey` in
 * `swedish-text.ts`, which preserves diacritics.
 */
export function normalizeLookupKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Expand one raw OS-username candidate into several lookup candidates:
 * full value, `DOMAIN\user` → `user`, `domain/user` → `user`, and
 * `user@host` → `user`. Preserves order; does not dedupe.
 */
export function expandIdentityCandidate(raw: string): string[] {
  const out: string[] = [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return out;
  out.push(trimmed);

  const slashSplit = trimmed.split(/[\\/]/);
  const afterSlash = slashSplit[slashSplit.length - 1];
  if (afterSlash !== undefined && afterSlash !== trimmed && afterSlash.length > 0) {
    out.push(afterSlash);
  }

  const atIdx = trimmed.indexOf('@');
  if (atIdx > 0) {
    out.push(trimmed.slice(0, atIdx));
  }
  return out;
}

/** All generated lookup keys for a user (for pass 2 of resolution). */
function generateUserLookupKeys(user: KatsUser): string[] {
  const words = user.fullName.split(/\s+/).filter((w) => w.length > 0);
  const firstWord = words[0] ?? '';
  const lastWord = words[words.length - 1] ?? '';
  const collapsed = user.fullName.replace(/\s+/g, '');

  const keys: string[] = [
    user.key,
    user.shortName,
    user.fullName,
    firstWord,
    firstWord + lastWord,
    collapsed,
    ...user.aliases,
  ];
  return keys.filter((k) => k.length > 0);
}

/**
 * Resolve the current user from raw identity candidates (typically
 * `process.env.USER`, `USERNAME`, etc.). Falls back to the DB's default
 * user if nothing matches.
 */
export function resolveCurrentUser(db: UserDatabase, rawCandidates: readonly string[]): KatsUser {
  const normalized = rawCandidates
    .flatMap(expandIdentityCandidate)
    .map(normalizeLookupKey)
    .filter((k) => k.length > 0);

  // Pass 1: exact match on primary key.
  for (const candidate of normalized) {
    for (const user of db.users) {
      if (normalizeLookupKey(user.key) === candidate) return user;
    }
  }

  // Pass 2: match on any generated key.
  for (const candidate of normalized) {
    for (const user of db.users) {
      for (const key of generateUserLookupKeys(user)) {
        if (normalizeLookupKey(key) === candidate) return user;
      }
    }
  }

  const fallback = db.users.find((u) => u.key === db.defaultUserKey);
  // Schema refine guarantees this exists — cast-free assertion for ts.
  if (fallback === undefined) {
    throw new Error('invariant: defaultUserKey not found after schema validation');
  }
  return fallback;
}
