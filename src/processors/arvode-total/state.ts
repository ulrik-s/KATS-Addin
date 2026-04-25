import { type KatsContext } from '../../core/context.js';
import {
  ARVODE_TOTAL_READ_KEY,
  ARVODE_TOTAL_STATE_KEY,
  arvodeTotalReadSchema,
  arvodeTotalStateSchema,
  type ArvodeTotalRead,
  type ArvodeTotalState,
} from './schema.js';

export function getArvodeTotalRead(ctx: KatsContext): ArvodeTotalRead | undefined {
  return ctx.getSlot(ARVODE_TOTAL_READ_KEY, arvodeTotalReadSchema);
}

export function setArvodeTotalRead(ctx: KatsContext, value: ArvodeTotalRead): void {
  ctx.setSlot(ARVODE_TOTAL_READ_KEY, arvodeTotalReadSchema, value);
}

export function requireArvodeTotalRead(ctx: KatsContext): ArvodeTotalRead {
  return ctx.requireSlot(ARVODE_TOTAL_READ_KEY, arvodeTotalReadSchema);
}

export function getArvodeTotalState(ctx: KatsContext): ArvodeTotalState | undefined {
  return ctx.getSlot(ARVODE_TOTAL_STATE_KEY, arvodeTotalStateSchema);
}

export function setArvodeTotalState(ctx: KatsContext, value: ArvodeTotalState): void {
  ctx.setSlot(ARVODE_TOTAL_STATE_KEY, arvodeTotalStateSchema, value);
}

export function requireArvodeTotalState(ctx: KatsContext): ArvodeTotalState {
  return ctx.requireSlot(ARVODE_TOTAL_STATE_KEY, arvodeTotalStateSchema);
}
