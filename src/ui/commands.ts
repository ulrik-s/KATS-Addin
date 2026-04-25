/**
 * Ribbon command host. Word loads `commands.html` in a hidden runtime
 * when the user clicks the "Processa KATS" button on the MGA tab. We
 * register one global function — `katsRun` — that the manifest's
 * `<Action xsi:type="ExecuteFunction">` references by name.
 */

import { runOnActiveDocument } from '../app/orchestrator.js';

void Office.onReady(() => {
  Office.actions.associate('katsRun', (event: Office.AddinCommands.Event) => {
    void katsRun(event);
  });
});

async function katsRun(event: Office.AddinCommands.Event): Promise<void> {
  try {
    const result = await runOnActiveDocument();
    console.info(
      '[KATS]',
      result.tagsProcessed > 0
        ? `klar — ${String(result.tagsProcessed)} tagg(ar) processade`
        : 'inga KATS-taggar hittades',
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    // Word's ribbon command runtime has no visible UI; we leave the
    // user-facing error display to the task pane. The task pane is the
    // recommended user surface — the ribbon button is a shortcut for
    // the happy path.
    console.error('[KATS] körning misslyckades:', message);
  } finally {
    event.completed();
  }
}
