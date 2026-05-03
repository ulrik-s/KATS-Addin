import { useState, type ChangeEvent, type JSX } from 'react';
import { KATS_ADDIN_VERSION, KATS_BUILD_KIND, KATS_GIT_BRANCH } from '../index.js';
import { getStoredUserKey, listAllUsers, setCurrentUserKey } from '../app/current-user.js';
import { formatError } from '../app/format-error.js';
import { mailDebugDocument } from '../app/mail-debug.js';
import { runOnActiveDocument } from '../app/orchestrator.js';
import {
  type CategoryRates,
  DEFAULT_RATES,
  getCategoryRateRaw,
  getRoundingMode,
  setCategoryRate,
  setRoundingMode,
  type RoundingMode,
} from '../app/settings.js';
import { LegacyUninstallHelp } from './LegacyUninstallHelp.js';

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

interface RateField {
  readonly key: keyof CategoryRates;
  readonly label: string;
}

const RATE_FIELDS: readonly RateField[] = [
  { key: 'arvode', label: 'Timtaxa (kr/h)' },
  { key: 'arvodeHelg', label: 'Timtaxa helg (kr/h)' },
  { key: 'tidsspillan', label: 'Tidsspillan (kr/h)' },
  { key: 'tidsspillanOvrigTid', label: 'Tidsspillan helg (kr/h)' },
];

type RatesState = Record<keyof CategoryRates, string>;

function readAllRates(): RatesState {
  return {
    arvode: getCategoryRateRaw('arvode'),
    arvodeHelg: getCategoryRateRaw('arvodeHelg'),
    tidsspillan: getCategoryRateRaw('tidsspillan'),
    tidsspillanOvrigTid: getCategoryRateRaw('tidsspillanOvrigTid'),
  };
}

export function App(): JSX.Element {
  const [status, setStatus] = useState<StatusState>({ kind: 'idle', message: '' });
  const [userKey, setUserKey] = useState<string>(getStoredUserKey() ?? '');
  const [roundingMode, setRoundingModeState] = useState<RoundingMode>(getRoundingMode());
  const [rates, setRatesState] = useState<RatesState>(readAllRates);

  const allUsers = listAllUsers();

  async function onRun(): Promise<void> {
    setStatus({ kind: 'busy', message: 'Processar dokumentet…' });
    try {
      const result = await runOnActiveDocument();
      const { tagsProcessed, skippedTags, warnings } = result;
      const lines: string[] = [];
      if (tagsProcessed > 0) {
        lines.push(`Klar — ${String(tagsProcessed)} tagg(ar) processade.`);
      } else if (skippedTags.length === 0) {
        lines.push('Inga KATS-taggar hittades i dokumentet.');
      }
      if (skippedTags.length > 0) {
        lines.push(
          `Hoppade över ${String(skippedTags.length)} tagg(ar) med fel format ` +
            `(markörer borttagna): ${skippedTags.join(', ')}.`,
        );
      }
      for (const w of warnings) lines.push(`Varning: ${w}`);
      const kind: StatusState['kind'] =
        warnings.length > 0 ? 'error' : tagsProcessed > 0 ? 'success' : 'info';
      setStatus({ kind, message: lines.join('\n') });
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

  function makeRateChangeHandler(category: keyof CategoryRates) {
    return (event: ChangeEvent<HTMLInputElement>): void => {
      const value = event.target.value;
      setRatesState((prev) => ({ ...prev, [category]: value }));
      setCategoryRate(category, value);
    };
  }

  return (
    <main>
      <h1>KATS</h1>
      <p className="kats-version">
        {KATS_BUILD_KIND === 'dev' ? (
          <span className="kats-build-badge kats-build-badge-dev">DEV</span>
        ) : KATS_BUILD_KIND === 'prod' ? (
          <span className="kats-build-badge kats-build-badge-prod">PROD</span>
        ) : null}
        <span className="kats-version-text">
          {KATS_ADDIN_VERSION} · {KATS_GIT_BRANCH}
        </span>
      </p>

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

      {RATE_FIELDS.map((field) => (
        <div key={field.key}>
          <label htmlFor={`kats-rate-${field.key}`}>{field.label}</label>
          <input
            id={`kats-rate-${field.key}`}
            type="text"
            inputMode="decimal"
            value={rates[field.key]}
            placeholder={String(DEFAULT_RATES[field.key])}
            onChange={makeRateChangeHandler(field.key)}
            style={INPUT_STYLE}
          />
        </div>
      ))}

      {status.message.length > 0 ? (
        <div className={statusClass(status.kind)}>{status.message}</div>
      ) : null}

      <LegacyUninstallHelp />
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
