import type { JSX } from 'react';

/**
 * Manual-uninstall instructions for the legacy MGA `.dotm` template.
 *
 * Why this is in the task pane and not automated:
 *   Office Add-ins run in a sandboxed JS runtime with no file-system
 *   access and no entry point to Word's COM `Application.AddIns` /
 *   `Application.Templates` collections. The legacy VBA template lives
 *   as a `.dotm` registered through Word's "Templates and Add-ins"
 *   dialog (or copied into the Startup folder) — neither is reachable
 *   from Office.js, so we can't unregister or delete it programmatically.
 *
 * The next best thing: surface the platform-specific paths and the
 * UI walkthrough here so users can do it themselves in 30 seconds.
 */
export function LegacyUninstallHelp(): JSX.Element {
  return (
    <details className="kats-help">
      <summary>Avinstallera gammal MGA-mall (.dotm)</summary>
      <div className="kats-help-body">
        <p>
          KATS-tillägget kan inte ta bort den gamla VBA-mallen automatiskt — Office.js kommer inte
          åt Words mallregister eller filsystemet. Följ stegen nedan istället.
        </p>

        <p className="kats-help-heading">Word för Mac</p>
        <ol>
          <li>
            Stäng Word helt (<em>Word → Avsluta Word</em>).
          </li>
          <li>
            Öppna Finder → <em>Gå → Gå till mapp…</em> och klistra in:
            <code className="kats-help-path">
              ~/Library/Group Containers/UBF8T346G9.Office/User
              Content.localized/Startup.localized/Word
            </code>
          </li>
          <li>
            Flytta eventuell <code>MGA*.dotm</code> till papperskorgen.
          </li>
          <li>Starta Word igen — den gamla MGA-fliken ska vara borta.</li>
        </ol>

        <p className="kats-help-heading">Word för Windows</p>
        <ol>
          <li>Stäng Word.</li>
          <li>
            Tryck <em>Win + R</em>, klistra in och kör:
            <code className="kats-help-path">%APPDATA%\Microsoft\Word\STARTUP</code>
          </li>
          <li>
            Ta bort <code>MGA*.dotm</code> från mappen.
          </li>
          <li>
            Om mallen även är registrerad via dialogen: starta Word, gå till{' '}
            <em>Arkiv → Alternativ → Tillägg</em>, välj <em>Mallar</em> i listrutan <em>Hantera</em>
            , klicka <em>Gå…</em> och avmarkera/ta bort posten.
          </li>
        </ol>

        <p className="kats-help-note">
          Om MGA-fliken finns kvar efter att <code>.dotm</code>-filen är borta: kontrollera{' '}
          <em>Tools → Templates and Add-ins…</em> (Mac) respektive samma dialog som ovan (Windows)
          och avregistrera kvarvarande poster.
        </p>
      </div>
    </details>
  );
}
