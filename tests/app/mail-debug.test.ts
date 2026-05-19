/**
 * Pin the debug-mail recipient. This is a real external contract —
 * accidentally changing the address means user-submitted bug reports
 * get lost.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mailDebugDocument } from '../../src/app/mail-debug.js';

const DEBUG_RECIPIENT = 'ulrik.sjolin@gmail.com';

describe('mailDebugDocument', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  function installFakeWindow(): { href: string } {
    const fakeLocation = { href: '' };
    (globalThis as { window?: unknown }).window = { location: fakeLocation };
    return fakeLocation;
  }

  it('opens a mailto: URL targeted at the firm debug recipient', () => {
    const fakeLocation = installFakeWindow();
    mailDebugDocument();
    expect(fakeLocation.href).toMatch(/^mailto:/);
    // RECIPIENT is encoded via encodeURIComponent — `@` becomes `%40`,
    // `.` stays as `.`.
    expect(fakeLocation.href).toContain(encodeURIComponent(DEBUG_RECIPIENT));
  });

  it('throws when `window` is unavailable (Node / SSR)', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => {
      mailDebugDocument();
    }).toThrow(/window unavailable/);
  });

  it('includes a non-empty subject + body in the URL', () => {
    const fakeLocation = installFakeWindow();
    mailDebugDocument();
    expect(fakeLocation.href).toMatch(/[?&]subject=/);
    expect(fakeLocation.href).toMatch(/[?&]body=/);
  });
});
