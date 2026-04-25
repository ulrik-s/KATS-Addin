import { KATS_ADDIN_VERSION } from '../index.js';

/**
 * "Maila tmp dokument" — opens the user's default mail client with a
 * pre-filled draft so they can attach the document that processed
 * incorrectly. Office.js does not expose attachment API in Word; we
 * fall back to a `mailto:` link that opens the user's mail app.
 *
 * The user attaches the original document manually after we open the
 * draft. That mirrors the legacy VBA behavior, which on macOS used
 * AppleScript to script Outlook — Office add-ins can't do that.
 */
const RECIPIENT = 'ulrik@mga.se';
const SUBJECT = 'KATS — felaktigt processat dokument';
const BODY_TEMPLATE =
  'Hej,\n\nKATS-tillägget hanterade följande dokument felaktigt. ' +
  'Originaldokumentet bifogas separat.\n\n' +
  'Beskrivning av problemet:\n\n\n' +
  'Sänt från KATS-tillägget version {{VERSION}}.\n';

export function mailDebugDocument(): void {
  const body = BODY_TEMPLATE.replace('{{VERSION}}', KATS_ADDIN_VERSION);
  const mailto =
    `mailto:${encodeURIComponent(RECIPIENT)}` +
    `?subject=${encodeURIComponent(SUBJECT)}` +
    `&body=${encodeURIComponent(body)}`;
  if (typeof window === 'undefined') {
    throw new Error('window unavailable');
  }
  window.location.href = mailto;
}
