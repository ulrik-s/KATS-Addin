# KATS-Addin

TypeScript Office Add-in for Word. Replaces the legacy VBA-based KATS-Tools (`.dotm`) macro template. Same end-user functionality: transform tagged Word documents (`[[KATS_*_START]]` … `[[KATS_*_END]]`).

## Non-negotiable rules

- **TypeScript strict.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` on.
- **Yarn 4 with Plug'n'Play** (`nodeLinker: pnp`). Never `node-modules`. If a tool forces a fallback, prefer `nodeLinker: pnpm`.
- **zod at I/O boundaries.** All processor state slices, the user DB, and any external data shapes are defined via `z.object(...)` and `z.infer`.
- **DRY + SOLID.** Small single-responsibility modules. No processor reaches into another; cross-processor data flows only through `KatsContext`.
- **ESLint must pass** with zero warnings. Prettier enforces formatting.

## Pipeline shape

Processors have three phases, and the pipeline runs them phase-at-a-time across **all** processors — not per-processor:

```
1. Read phase   — every processor reads its tag's Range into ctx.readState
2. Transform    — every processor runs pure business logic on ctx
3. Render phase — every processor writes results back to its Range
```

`transform` is synchronous, has no Office JS calls, and is unit-testable in isolation. `read` and `render` batch their Office JS operations inside a single `Word.run()` per phase to avoid nested-context deadlocks.

## Processor inventory (from VBA inventory; all 8 must port)

| Tag                                  | Input            | Produces                                      |
| ------------------------------------ | ---------------- | --------------------------------------------- |
| `KATS_UTLAGGSSPECIFIKATION`          | table (5 col)    | utlägg ex/ej moms                             |
| `KATS_ARGRUPPERTIDERDATUMANTALSUMMA` | table, sectioned | category hours, taxemål flag, hearing minutes |
| `KATS_ARVODE`                        | table (6 rows)   | arvode ex moms                                |
| `KATS_ARVODE_TOTAL`                  | table (4 rows)   | moms, totals                                  |
| `KATS_MOTTAGARE`                     | table 1×2        | postort                                       |
| `KATS_SIGNATUR`                      | range            | signature block                               |
| `KATS_YTTRANDE_SIGNATUR`             | range            | signature block                               |
| `KATS_YTTRANDE_PARTER`               | range            | party dropdowns + name replacement            |

VBA reference source (read-only during migration): `/Users/ulrik/src/KATS-Tools`.

## Swedish diacritics

All text matching goes through `domain/swedish-text.ts`. Inputs are NFC-normalized before comparison. Outputs are always NFC. Direct `.includes()` / `===` on any string that could contain `å/ä/ö` is a lint-reviewable smell.

Dedicated test suite at `tests/diacritics/` covers NFC, NFD, mixed normalization, and upper/lowercase for every text field a processor touches.

## Deployment

- **Bundle hosting:** GitHub Pages.
- **Distribution:** Microsoft 365 Admin Center → Integrated Apps (Centralized Deployment) to the company tenant.
- **Release:** push git tag `v*` → CI builds, deploys Pages, creates GitHub Release with `manifest.xml`. Admin uploads manifest to M365 (manual initially; via Graph API later).
- **No installers.** No `.dotm`, no Inno Setup, no AppleScript.

## Phases

- **Fas 0** — scaffold (this repo; CI green on empty skeleton)
- **Fas 1** — core: `KatsContext`, `PipelineRunner`, `TagScanner`, `swedish-text`
- **Fas 2** — first processor: `Signatur` (simplest; validates architecture)
- **Fas 3** — metadata: `Mottagare`, `YttrandeSignatur`, `YttrandeParter`
- **Fas 4** — economics chain: `Utlagg` → `ArgrupperTider` → `Arvode` → `ArvodeTotal`
- **Fas 5** — UI: task pane (React), ribbon command, Office JS adapters, GitHub Pages release pipeline
- **Fas 6** — parity verification against VBA on real documents
- **Fas 7** — pilot rollout (3–5 users)
- **Fas 8** — full rollout; VBA `.dotm` deprecated

## Sideloading for development

Two terminals — one for the dev server, one for the sideload.

**Terminal 1** — dev server (keep running):

```
yarn start
```

Generates `manifest/manifest.dev.xml` (HOST_URL = `https://localhost:3000`), then starts the Vite dev server with HTTPS (`@vitejs/plugin-basic-ssl` auto-issues a self-signed cert).

**Terminal 2** — sideload into Word:

### Mac (and Windows)

```
yarn sideload
```

Wraps Microsoft's official `office-addin-debugging start` tool. It writes the manifest to whichever sideload folder the installed Word version actually scans (newer M365 builds moved the path), launches Word, and registers the add-in. Note: it will close Word first if running.

> _Tools → Templates and Add-ins is for legacy VBA `.dotm` templates and is unrelated to Office add-ins. The dev manifest doesn't show up there._

> The naive "drop manifest into `Documents/wef/`" approach silently stops working on newer Mac M365 builds — Word stops scanning that folder. The dev tool knows the right path per version.

To remove the dev add-in afterwards:

```
npx --yes office-addin-debugging stop manifest/manifest.dev.xml --app word
```

### After sideloading

Click **Öppna panel** on the KATS ribbon tab to show the task pane. Subsequent code edits hot-reload via Vite — no re-sideload needed.

### Fallback: M365 Admin Center deploy

When the dev tool also fails (managed-tenant policy blocking developer add-ins, etc.), use the production rollout path even for development:

1. `yarn build` — produces `dist/manifest.xml` pointing at GitHub Pages.
2. Push the bundle to a temporary publicly-reachable HTTPS host, OR push a tag to deploy via GitHub Pages.
3. **admin.microsoft.com** → **Settings** → **Integrated apps** → **Upload custom apps** → pick `dist/manifest.xml`.
4. Assign to your own user. Provisioning takes 5–30 minutes; restart Word and the add-in arrives via the official channel.

This is the production rollout flow anyway — doing it for dev verifies the eventual user experience.

## Build environment variables

- `KATS_VERSION` — overrides `package.json` version in the manifest.
- `KATS_HOST_URL` — overrides the hosted bundle URL (default `https://ulrik-s.github.io/KATS-Addin`).
- `KATS_ADDIN_GUID` — overrides the manifest GUID (default reads `manifest/guid.txt`).
