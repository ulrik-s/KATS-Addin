/**
 * mailDebugDocument orchestrates a three-step bug-report flow:
 *   1. read active doc as Blob   (Office.js)
 *   2. save Blob to Downloads     (browser DOM)
 *   3. open mailto: with subject + body that names the saved file
 *
 * Steps 1 + 2 + 3 are dependency-injected so the orchestrator can be
 * exercised without Office.js or a browser DOM. The Office.js + DOM
 * adapters in the production deps live in mail-debug.ts itself; they
 * are intentionally untested here (they need a Word host).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  buildDownloadFilename,
  buildMailtoUrl,
  formatDownloadTimestamp,
  mailDebugDocument,
  type MailDebugDeps,
} from '../../src/app/mail-debug.js';

const DEBUG_RECIPIENT = 'ulrik.sjolin@gmail.com';
const FIXED_NOW = new Date(2026, 4, 19, 14, 5, 7); // 2026-05-19 14:05:07 local

function fakeBlob(): Blob {
  // Lightweight stand-in; tests don't read the contents.
  return new Blob(['<docx-bytes>'], { type: 'application/octet-stream' });
}

function makeDeps(overrides: Partial<MailDebugDeps> = {}): {
  deps: MailDebugDeps;
  getDocumentBlob: ReturnType<typeof vi.fn>;
  downloadBlob: ReturnType<typeof vi.fn>;
  openMailto: ReturnType<typeof vi.fn>;
} {
  const getDocumentBlob = vi.fn(() => Promise.resolve(fakeBlob()));
  const downloadBlob = vi.fn();
  const openMailto = vi.fn();
  return {
    getDocumentBlob,
    downloadBlob,
    openMailto,
    deps: {
      getDocumentBlob,
      downloadBlob,
      openMailto,
      now: () => FIXED_NOW,
      ...overrides,
    },
  };
}

describe('formatDownloadTimestamp', () => {
  it('returns YYYY-MM-DD-HHmmss', () => {
    expect(formatDownloadTimestamp(FIXED_NOW)).toBe('2026-05-19-140507');
  });

  it('zero-pads single-digit month/day/hour/minute/second', () => {
    const d = new Date(2026, 0, 2, 3, 4, 5);
    expect(formatDownloadTimestamp(d)).toBe('2026-01-02-030405');
  });

  it('renders the same instant byte-identically across calls', () => {
    const d = new Date(2026, 5, 1, 12, 0, 0);
    expect(formatDownloadTimestamp(d)).toBe(formatDownloadTimestamp(d));
  });
});

describe('buildDownloadFilename', () => {
  it('returns kats-debug-<timestamp>.docx', () => {
    expect(buildDownloadFilename(FIXED_NOW)).toBe('kats-debug-2026-05-19-140507.docx');
  });
});

describe('buildMailtoUrl', () => {
  it('targets the firm debug recipient', () => {
    const url = buildMailtoUrl('kats-debug-x.docx', '1.2.0');
    expect(url).toMatch(/^mailto:/);
    expect(url).toContain(encodeURIComponent(DEBUG_RECIPIENT));
  });

  it('includes the filename in the body so the user knows what to attach', () => {
    const url = buildMailtoUrl('kats-debug-2026-05-19-140507.docx', '1.2.0');
    const decodedBody = decodeBodyParam(url);
    expect(decodedBody).toContain('kats-debug-2026-05-19-140507.docx');
    expect(decodedBody).toMatch(/[Bb]ifoga/);
  });

  it('includes the running version in the body', () => {
    const url = buildMailtoUrl('x.docx', '9.9.9-test');
    expect(decodeBodyParam(url)).toContain('9.9.9-test');
  });

  it('includes a non-empty subject', () => {
    const url = buildMailtoUrl('x.docx', '1.0.0');
    expect(url).toMatch(/[?&]subject=[^&]+/);
  });
});

describe('mailDebugDocument — orchestration', () => {
  it('downloads the active doc as kats-debug-<timestamp>.docx', async () => {
    const { deps, downloadBlob } = makeDeps();
    await mailDebugDocument(deps);
    expect(downloadBlob).toHaveBeenCalledOnce();
    const call = downloadBlob.mock.calls[0];
    const blob: unknown = call?.[0];
    const filename: unknown = call?.[1];
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toBe('kats-debug-2026-05-19-140507.docx');
  });

  it('opens the mailto with a body naming the downloaded file', async () => {
    const { deps, openMailto } = makeDeps();
    await mailDebugDocument(deps);
    expect(openMailto).toHaveBeenCalledOnce();
    const url: unknown = openMailto.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    const s = url as string;
    expect(s).toMatch(/^mailto:/);
    expect(decodeBodyParam(s)).toContain('kats-debug-2026-05-19-140507.docx');
  });

  it('orders steps: blob → download → mailto', async () => {
    const order: string[] = [];
    const { deps } = makeDeps({
      getDocumentBlob: vi.fn(() => {
        order.push('blob');
        return Promise.resolve(fakeBlob());
      }),
      downloadBlob: vi.fn(() => {
        order.push('download');
      }),
      openMailto: vi.fn(() => {
        order.push('mailto');
      }),
    });
    await mailDebugDocument(deps);
    expect(order).toEqual(['blob', 'download', 'mailto']);
  });

  it('does NOT open the mailto when getDocumentBlob fails', async () => {
    const { deps, downloadBlob, openMailto } = makeDeps({
      getDocumentBlob: vi.fn(() => Promise.reject(new Error('document is unsaved'))),
    });
    await expect(mailDebugDocument(deps)).rejects.toThrow(/unsaved/);
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(openMailto).not.toHaveBeenCalled();
  });

  it('propagates a download failure without opening mailto', async () => {
    const { deps, openMailto } = makeDeps({
      downloadBlob: vi.fn(() => {
        throw new Error('DOM unavailable');
      }),
    });
    await expect(mailDebugDocument(deps)).rejects.toThrow(/DOM/);
    expect(openMailto).not.toHaveBeenCalled();
  });
});

/** Extract the decoded `body=` parameter from a mailto URL. */
function decodeBodyParam(url: string): string {
  const match = /[?&]body=([^&]*)/.exec(url);
  const raw = match?.[1];
  if (raw === undefined) throw new Error(`No body param in ${url}`);
  return decodeURIComponent(raw);
}
