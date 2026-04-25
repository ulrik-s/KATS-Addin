import { type KatsContext } from '../../core/context.js';
import {
  ARVODE_READ_KEY,
  ARVODE_STATE_KEY,
  arvodeReadSchema,
  arvodeStateSchema,
  type ArvodeRead,
  type ArvodeState,
} from './schema.js';

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
