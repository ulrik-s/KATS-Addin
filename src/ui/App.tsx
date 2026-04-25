import { useState, type ChangeEvent, type JSX } from 'react';
import { KATS_ADDIN_VERSION } from '../index.js';
import { getStoredUserKey, listAllUsers, setCurrentUserKey } from '../app/current-user.js';
import { formatError } from '../app/format-error.js';
import { mailDebugDocument } from '../app/mail-debug.js';
import { runOnActiveDocument } from '../app/orchestrator.js';
import {
  getHourlyRateOverrideRaw,
  getRoundingMode,
  setHourlyRateOverride,
  setRoundingMode,
  type RoundingMode,
} from '../app/settings.js';

interface StatusState {
  readonly kind: 'idle' | 'busy' | 'success' | 'error' | 'info';
  readonly message: string;
}

const SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '6px',
  marginTop: '4px',
  marginBottom: '12px',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '6px',
  marginTop: '4px',
  marginBottom: '12px',
  boxSizing: 'border-box',
};

export function App(): JSX.Element {
  const [status, setStatus] = useState<StatusState>({ kind: 'idle', message: '' });
  const [userKey, setUserKey] = useState<string>(getStoredUserKey() ?? '');
  const [roundingMode, setRoundingModeState] = useState<RoundingMode>(getRoundingMode());
  const [hourlyRate, setHourlyRateState] = useState<string>(getHourlyRateOverrideRaw());

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
      const message = formatError(cause);
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
      const message = formatError(cause);
      setStatus({ kind: 'error', message: `Kunde inte öppna e-post: ${message}` });
    }
  }

  function onUserChange(event: ChangeEvent<HTMLSelectElement>): void {
    const key = event.target.value;
    setUserKey(key);
    setCurrentUserKey(key);
    setStatus({ kind: 'info', message: `Aktiv användare satt till ${key}.` });
  }

  function onRoundingChange(event: ChangeEvent<HTMLSelectElement>): void {
    const mode = event.target.value === 'sum-only' ? 'sum-only' : 'per-row';
    setRoundingModeState(mode);
    setRoundingMode(mode);
  }

  function onHourlyRateChange(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value;
    setHourlyRateState(value);
    setHourlyRateOverride(value);
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
      <select id="kats-user" value={userKey} onChange={onUserChange} style={SELECT_STYLE}>
        <option value="">— välj —</option>
        {allUsers.map((u) => (
          <option key={u.key} value={u.key}>
            {u.fullName} ({u.shortName})
          </option>
        ))}
      </select>

      <label htmlFor="kats-rounding">Avrundning</label>
      <select
        id="kats-rounding"
        value={roundingMode}
        onChange={onRoundingChange}
        style={SELECT_STYLE}
      >
        <option value="per-row">Per rad (domstol)</option>
        <option value="sum-only">Endast på summa</option>
      </select>

      <label htmlFor="kats-rate">Timtaxa (kr/h)</label>
      <input
        id="kats-rate"
        type="text"
        inputMode="decimal"
        value={hourlyRate}
        placeholder="lämna tomt → från dokumentet"
        onChange={onHourlyRateChange}
        style={INPUT_STYLE}
      />

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
