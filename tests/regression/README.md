# Regression tests

End-to-end tests that pin a specific user-reported bug. Each file
reproduces the original symptom and asserts the fix.

## When to put a test here

Add a file in this folder when:

- A user reports a bug in production (e.g. via email, the "Maila tmp
  dokument" flow, or a direct screenshot).
- The bug surfaced because a unit test had a blind spot — the
  regression file becomes the canary for that scenario.
- The fix spans multiple processors / layers and a pure unit test
  can't capture it (cross-processor pipeline through `runPipeline`).

If the bug is fully reproducible inside a single processor's
`*.test.ts`, leave the assertion inline there — co-located with the
related unit tests. Use this folder for _whole-pipeline_ fidelity.

## File naming

`<short-scenario>.test.ts` — lowercased, hyphenated. Examples:

- `cecilia-debug-1.test.ts` — KATS-Debug-1.docx, English aliases.
- `hearing-time-zero-2026-05-19.test.ts` — "Medverkat vid förhandling
  ger 0,00".

When in doubt, include the report date in the filename so the
chronology is obvious.

## File structure

Every regression file starts with a docblock that names:

1. **What** the symptom was (verbatim from the user when possible).
2. **When** it was reported.
3. **Root cause** in one or two sentences.
4. **Fix reference** — commit SHA or PR number.

Followed by `describe()` blocks that exercise the bug through
`runPipeline` (the same entry point production uses) with the real
processors registered. Faking is fine for Office.js adapters but
the pure transforms must be the real ones.

## What goes inline instead

Keep inline (in `tests/processors/<name>/processor.test.ts` or
`tests/domain/<name>.test.ts`):

- Edge-case unit tests for a single function.
- Boundary-checklist coverage (see [CLAUDE.md](../../CLAUDE.md)
  _Test discipline_).
- Tests for cross-cutting helpers (`swedishLooseEqualsAny` etc.).

The regression folder is for _user-visible scenarios_, not unit
coverage. Both layers should exist — they catch different classes
of regression.
