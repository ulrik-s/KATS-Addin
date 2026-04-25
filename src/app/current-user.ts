import { type KatsUser, resolveCurrentUser } from '../domain/user-db.js';
import { USERS } from '../domain/users.data.js';

/**
 * Where the user's preferred identity is stored in the browser. Office
 * add-ins run inside a sandboxed iframe; localStorage is per-add-in,
 * per-user and survives Word restarts. For multi-machine roaming, swap
 * to `Office.context.roamingSettings` later.
 */
const STORAGE_KEY = 'kats:userKey';

/** Resolve the current user from stored preference, falling back to default. */
export function getCurrentUser(): KatsUser {
  const candidates: string[] = [];
  const stored = readStorage(STORAGE_KEY);
  if (stored !== undefined && stored.trim().length > 0) candidates.push(stored.trim());
  return resolveCurrentUser(USERS, candidates);
}

/** Persist the user's identity choice. */
export function setCurrentUserKey(key: string): void {
  writeStorage(STORAGE_KEY, key);
}

/** Read the raw stored key (without resolution) — used by UI to populate selects. */
export function getStoredUserKey(): string | undefined {
  const v = readStorage(STORAGE_KEY);
  if (v === undefined) return undefined;
  return v.length > 0 ? v : undefined;
}

/** All users, exposed for the task pane's user-picker. */
export function listAllUsers(): readonly KatsUser[] {
  return USERS.users;
}

function readStorage(key: string): string | undefined {
  try {
    const value = globalThis.localStorage.getItem(key);
    return value ?? undefined;
  } catch {
    // Some embedded browsers throw on storage access (private mode,
    // strict origin policy, etc.) — treat as "not set".
    return undefined;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // No-op; caller can render an error.
  }
}
