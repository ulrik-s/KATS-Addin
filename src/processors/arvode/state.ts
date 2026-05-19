import { type KatsContext } from '../../core/context.js';
import { getMottagareState } from '../mottagare/state.js';
import {
  ARVODE_READ_KEY,
  ARVODE_STATE_KEY,
  arvodeReadSchema,
  arvodeStateSchema,
  type ArvodeRead,
  type ArvodeState,
} from './schema.js';

/** Per-row vs sum-only — the two rounding policies the firm uses. */
export type RoundingMode = 'per-row' | 'sum-only';

export function getArvodeRead(ctx: KatsContext): ArvodeRead | undefined {
  return ctx.getSlot(ARVODE_READ_KEY, arvodeReadSchema);
}

export function setArvodeRead(ctx: KatsContext, value: ArvodeRead): void {
  ctx.setSlot(ARVODE_READ_KEY, arvodeReadSchema, value);
}

export function requireArvodeRead(ctx: KatsContext): ArvodeRead {
  return ctx.requireSlot(ARVODE_READ_KEY, arvodeReadSchema);
}

export function getArvodeState(ctx: KatsContext): ArvodeState | undefined {
  return ctx.getSlot(ARVODE_STATE_KEY, arvodeStateSchema);
}

export function setArvodeState(ctx: KatsContext, value: ArvodeState): void {
  ctx.setSlot(ARVODE_STATE_KEY, arvodeStateSchema, value);
}

export function requireArvodeState(ctx: KatsContext): ArvodeState {
  return ctx.requireSlot(ARVODE_STATE_KEY, arvodeStateSchema);
}

/** Cross-processor helper for ARVODE_TOTAL — exposes the ex-moms total. */
export function getArvodeExMomsFromContext(ctx: KatsContext): number | undefined {
  return getArvodeState(ctx)?.totalExMomsKr;
}

/**
 * Derive the ARVODE rounding policy from the recipient's court flag
 * (set by MOTTAGARE during its read phase).
 *
 *   court        → 'per-row'  (legacy domstols-metoden: each line
 *                              rounded to whole kr before summing)
 *   non-court    → 'sum-only' (per-row kr-and-öre exact; only the
 *                              total rounded to whole kr at the end)
 *   no MOTTAGARE → 'per-row'  (safe default — matches legacy/VBA
 *                              behaviour for docs without a recipient
 *                              tag)
 *
 * This is the *single source of truth* for the policy. ArvodeProcessor
 * calls it; no other code (settings, UI) participates. Extending the
 * rule (e.g. honouring user override per-doc) means changing only this
 * function.
 */
export function getRoundingModeFromContext(ctx: KatsContext): RoundingMode {
  const mottagare = getMottagareState(ctx);
  if (mottagare === undefined) return 'per-row';
  return mottagare.isCourt ? 'per-row' : 'sum-only';
}
