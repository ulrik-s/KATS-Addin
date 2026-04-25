import { type KatsContext } from '../../core/context.js';
import {
  UTLAGG_READ_KEY,
  UTLAGG_STATE_KEY,
  utlaggReadSchema,
  utlaggStateSchema,
  type UtlaggRead,
  type UtlaggState,
} from './schema.js';

export function getUtlaggRead(ctx: KatsContext): UtlaggRead | undefined {
  return ctx.getSlot(UTLAGG_READ_KEY, utlaggReadSchema);
}

export function setUtlaggRead(ctx: KatsContext, value: UtlaggRead): void {
  ctx.setSlot(UTLAGG_READ_KEY, utlaggReadSchema, value);
}

export function requireUtlaggRead(ctx: KatsContext): UtlaggRead {
  return ctx.requireSlot(UTLAGG_READ_KEY, utlaggReadSchema);
}

export function getUtlaggState(ctx: KatsContext): UtlaggState | undefined {
  return ctx.getSlot(UTLAGG_STATE_KEY, utlaggStateSchema);
}

export function setUtlaggState(ctx: KatsContext, value: UtlaggState): void {
  ctx.setSlot(UTLAGG_STATE_KEY, utlaggStateSchema, value);
}

export function requireUtlaggState(ctx: KatsContext): UtlaggState {
  return ctx.requireSlot(UTLAGG_STATE_KEY, utlaggStateSchema);
}

/** Convenience helper for downstream processors (ARVODE_TOTAL). */
export function getUtlaggTotalsFromContext(
  ctx: KatsContext,
): { exMomsKr: number; ejMomsKr: number } | undefined {
  const state = getUtlaggState(ctx);
  if (!state) return undefined;
  return { exMomsKr: state.totalExMomsKr, ejMomsKr: state.totalEjMomsKr };
}
