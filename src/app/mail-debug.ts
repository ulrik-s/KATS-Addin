import { KATS_ADDIN_VERSION } from '../index.js';

/**
 * "Maila tmp dokument" — used by the task pane to send a bug report
 * with the offending document attached.
 *
 * Constraints:
 *   - `mailto:` URLs cannot carry attachments (RFC 6068). They only
 *     pre-fill subject + body; the user has to attach the file
 *     themselves once the mail client opens.
 *   - Office.js gives us the active document as a binary blob via
 *     `Office.context.document.getFileAsync(Office.FileType.Compressed)`.
 *   - Browsers can download an arbitrary blob via an in-memory
 *     `<a download>` link.
 *
 * So the flow is: read the active doc → save it to the user's
 * Downloads folder with a clear timestamped filename → open the
 * mailto draft with a body that *names* that file. The user only
 * needs to drag the downloaded file into the open mail draft.
 *
 * The orchestrator is dependency-injected so it can be unit-tested
 * without Office.js or a browser DOM. The default deps live further
 * down and bridge to the real platform.
 */

const RECIPIENT = 'ulrik.sjolin@gmail.com';
const SUBJECT = 'KATS — felaktigt processat dokument';
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Pure dependencies — the orchestrator never touches Office.js / DOM directly. */
export interface MailDebugDeps {
  /** Read the active Word document as a .docx Blob. */
  readonly getDocumentBlob: () => Promise<Blob>;
  /** Trigger a browser download of `blob` saved as `filename`. */
  readonly downloadBlob: (blob: Blob, filename: string) => void;
  /** Open the user's default mail client at the given mailto URL. */
  readonly openMailto: (url: string) => void;
  /** Source of "now" for the timestamped filename. */
  readonly now: () => Date;
}

/**
 * Compose a `mailto:` URL with subject + body. The body explicitly
 * tells the user which file to attach so they can drag the freshly
 * downloaded .docx into the open draft.
 */
export function buildMailtoUrl(filename: string, version: string): string {
  const body =
    'Hej,\n\n' +
    'KATS-tillägget hanterade följande dokument felaktigt.\n\n' +
    `Bifoga filen "${filename}" som just laddats ned i din ` +
    'webbläsares nedladdningsmapp.\n\n' +
    'Beskrivning av problemet:\n\n\n' +
    `Sänt från KATS-tillägget version ${version}.\n`;
  return (
    `mailto:${encodeURIComponent(RECIPIENT)}` +
    `?subject=${encodeURIComponent(SUBJECT)}` +
    `&body=${encodeURIComponent(body)}`
  );
}

/**
 * Filename-safe timestamp: `YYYY-MM-DD-HHmmss` in the user's local
 * timezone. Same instant rendered twice is byte-identical.
 */
export function formatDownloadTimestamp(date: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear().toString().padStart(4, '0')}-` +
    `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Build the standardized download filename for a debug attachment. */
export function buildDownloadFilename(now: Date): string {
  return `kats-debug-${formatDownloadTimestamp(now)}.docx`;
}

/**
 * Orchestrate the bug-report flow. Steps:
 *   1. Fetch the active document as a Blob.
 *   2. Save it to the user's Downloads folder.
 *   3. Open the mailto draft with a body naming the downloaded file.
 *
 * If step 1 fails (e.g. document not saved yet) the mailto is *not*
 * opened — caller surfaces the error in the task pane.
 */
export async function mailDebugDocument(deps: MailDebugDeps = DEFAULT_DEPS): Promise<void> {
  const blob = await deps.getDocumentBlob();
  const filename = buildDownloadFilename(deps.now());
  deps.downloadBlob(blob, filename);
  deps.openMailto(buildMailtoUrl(filename, KATS_ADDIN_VERSION));
}

// ─────────────── Default (production) deps ───────────────
//
// These hit the real platform — Office.js for the document, DOM for
// the download, window.location for the mailto. They are intentionally
// thin: every non-trivial decision lives in the orchestrator above so
// tests can exercise it via fakes.

const DEFAULT_DEPS: MailDebugDeps = {
  getDocumentBlob: getActiveDocumentBlobViaOfficeJs,
  downloadBlob: triggerBlobDownload,
  openMailto: openMailtoUrl,
  now: () => new Date(),
};

/**
 * Pull the active Word document out via `Office.context.document.getFileAsync`.
 * Returns the raw .docx as a Blob (the standard MIME).
 */
function getActiveDocumentBlobViaOfficeJs(): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    // `Office` is declared globally by @types/office-js but the actual
    // runtime is only present when loaded by Word. Probe it through
    // `globalThis` so the check is honest at runtime.
    const officeRuntime = (globalThis as { Office?: typeof Office }).Office;
    if (officeRuntime === undefined) {
      reject(new Error('Office.js inte tillgänglig — körs detta verkligen i Word?'));
      return;
    }
    officeRuntime.context.document.getFileAsync(
      Office.FileType.Compressed,
      { sliceSize: 65536 },
      (fileResult) => {
        if (fileResult.status === Office.AsyncResultStatus.Failed) {
          reject(new Error(fileResult.error.message));
          return;
        }
        const file = fileResult.value;
        const sliceCount = file.sliceCount;
        const slices: Uint8Array[] = new Array<Uint8Array>(sliceCount);
        let received = 0;
        const readSlice = (index: number): void => {
          file.getSliceAsync(index, (sliceResult) => {
            if (sliceResult.status === Office.AsyncResultStatus.Failed) {
              file.closeAsync(() => undefined);
              reject(new Error(sliceResult.error.message));
              return;
            }
            const raw: unknown = sliceResult.value.data;
            slices[index] = toUint8Array(raw);
            received += 1;
            if (received === sliceCount) {
              file.closeAsync(() => undefined);
              resolve(new Blob(slices as BlobPart[], { type: MIME_DOCX }));
            } else if (index + 1 < sliceCount) {
              readSlice(index + 1);
            }
          });
        };
        readSlice(0);
      },
    );
  });
}

/**
 * Office.js's slice payload type varies across platforms: ArrayBuffer
 * on modern Word, plain `number[]` on some older builds. Normalize to
 * a Uint8Array that Blob can accept.
 */
function toUint8Array(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Array.isArray(raw)) return new Uint8Array(raw as number[]);
  throw new Error('Oväntat slice-format från Office.js getFileAsync');
}

/**
 * Trigger a browser download for `blob` saved as `filename`. Uses an
 * in-memory object URL + click on a hidden anchor — the standard
 * pattern that works in every Chromium/WebKit/Gecko shell Office
 * runs add-ins in.
 */
function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('DOM / URL.createObjectURL otillgänglig — körs detta i en webview?');
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // The browser keeps the blob alive until the download completes;
  // revoking right after click() is safe per the standard.
  URL.revokeObjectURL(url);
}

function openMailtoUrl(url: string): void {
  if (typeof window === 'undefined') {
    throw new Error('window unavailable');
  }
  window.location.href = url;
}
