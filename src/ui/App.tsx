import { useState, type ChangeEvent, type JSX } from 'react';
import { KATS_ADDIN_VERSION } from '../index.js';
import { getStoredUserKey, listAllUsers, setCurrentUserKey } from '../app/current-user.js';
import { runOnActiveDocument } from '../app/orchestrator.js';
import { mailDebugDocument } from '../app/mail-debug.js';

interface StatusState {
  readonly kind: 'idle' | 'busy' | 'success' | 'error' | 'info';
  readonly message: string;
}

export function App(): JSX.Element {
  const [status, setStatus] = useState<StatusState>({ kind: 'idle', message: '' });
  const [userKey, setUserKey] = useState<string>(getStoredUserKey() ?? '');

  const allUsers = listAllUsers();

  async function onRun(): Promise<void> {
    setStatus({ kind: 'busy', message: 'Processar dokumentet…' });
    try {
      const result = await runOnActiveDocument();
      setStatus({
        kind: result.tagsProcessed > 0 ? 'success' : 'info',
        message:
          result.tagsProcessed > 0
            ? `Klar — ${String(result.tagsProcessed)} tagg(ar) processade.`
            : 'Inga KATS-taggar hittades i dokumentet.',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setStatus({ kind: 'error', message: `Misslyckades: ${message}` });
    }
  }

  function onMailDebug(): void {
    try {
      mailDebugDocument();
      setStatus({
        kind: 'success',
        message: 'Felrapport öppnad i e-postklienten — bifoga gärna originaldokumentet.',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setStatus({ kind: 'error', message: `Kunde inte öppna e-post: ${message}` });
    }
  }

  function onUserChange(event: ChangeEvent<HTMLSelectElement>): void {
    const key = event.target.value;
    setUserKey(key);
    setCurrentUserKey(key);
    setStatus({ kind: 'info', message: `Aktiv användare satt till ${key}.` });
  }

  return (
    <main>
      <h1>KATS</h1>
      <p className="kats-version">version {KATS_ADDIN_VERSION}</p>

      <div className="kats-buttons">
        <button
          className="kats-button"
          onClick={() => {
            void onRun();
          }}
          disabled={status.kind === 'busy'}
        >
          Processa KATS
        </button>
        <button
          className="kats-button kats-button-secondary"
          onClick={onMailDebug}
          disabled={status.kind === 'busy'}
        >
          Maila tmp dokument
        </button>
      </div>

      <label htmlFor="kats-user">Aktiv användare</label>
      <select
        id="kats-user"
        value={userKey}
        onChange={onUserChange}
        style={{ width: '100%', padding: '6px', marginTop: '4px', marginBottom: '12px' }}
      >
        <option value="">— välj —</option>
        {allUsers.map((u) => (
          <option key={u.key} value={u.key}>
            {u.fullName} ({u.shortName})
          </option>
        ))}
      </select>

      {status.message.length > 0 ? (
        <div className={statusClass(status.kind)}>{status.message}</div>
      ) : null}
    </main>
  );
}

function statusClass(kind: StatusState['kind']): string {
  switch (kind) {
    case 'success':
      return 'kats-status kats-status-success';
    case 'error':
      return 'kats-status kats-status-error';
    default:
      return 'kats-status';
  }
}
