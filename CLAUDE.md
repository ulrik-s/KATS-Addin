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
- **Fas 5** — UI: task pane (React + Fluent UI), ribbon command
- **Fas 6** — parity verification against VBA on real documents
- **Fas 7** — pilot rollout (3–5 users)
- **Fas 8** — full rollout; VBA `.dotm` deprecated
