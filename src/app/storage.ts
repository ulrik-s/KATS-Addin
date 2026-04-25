/**
 * Shared localStorage helpers for the task pane's persisted settings.
 *
 * Wraps every access in try/catch — Office add-ins occasionally run
 * in sandboxes (private browsing, strict origin) where storage
 * access throws. The wrappers degrade to "not set" / no-op rather
 * than crashing the UI.
 */

export function readStorage(key: string): string | undefined {
  try {
    const value = globalThis.localStorage.getItem(key);
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // No-op; caller can render an error.
  }
}
