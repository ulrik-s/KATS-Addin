import { type KatsContext } from '../../core/context.js';
import {
  ARGRUPPER_READ_KEY,
  ARGRUPPER_STATE_KEY,
  argrupperReadSchema,
  argrupperStateSchema,
  type ArgrupperRead,
  type ArgrupperState,
  type CategoryHours,
} from './schema.js';

export function getArgrupperRead(ctx: KatsContext): ArgrupperRead | undefined {
  return ctx.getSlot(ARGRUPPER_READ_KEY, argrupperReadSchema);
}

export function setArgrupperRead(ctx: KatsContext, value: ArgrupperRead): void {
  ctx.setSlot(ARGRUPPER_READ_KEY, argrupperReadSchema, value);
}

export function requireArgrupperRead(ctx: KatsContext): ArgrupperRead {
  return ctx.requireSlot(ARGRUPPER_READ_KEY, argrupperReadSchema);
}

export function getArgrupperState(ctx: KatsContext): ArgrupperState | undefined {
  return ctx.getSlot(ARGRUPPER_STATE_KEY, argrupperStateSchema);
}

export function setArgrupperState(ctx: KatsContext, value: ArgrupperState): void {
  ctx.setSlot(ARGRUPPER_STATE_KEY, argrupperStateSchema, value);
}

export function requireArgrupperState(ctx: KatsContext): ArgrupperState {
  return ctx.requireSlot(ARGRUPPER_STATE_KEY, argrupperStateSchema);
}

/** Cross-processor helper for ARVODE — needs hours per category. */
export function getCategoryHoursFromContext(ctx: KatsContext): CategoryHours | undefined {
  return getArgrupperState(ctx)?.hours;
}

/** Cross-processor helper: returns true if ARVODE should fall into the taxa path. */
export function shouldUseTaxaFromContext(ctx: KatsContext): boolean {
  const state = getArgrupperState(ctx);
  if (!state) return false;
  if (!state.isTaxemal) return false;
  if (state.hearingStart === undefined || state.hearingMinutes === undefined) return false;
  return state.hearingMinutes <= 225;
}

/** Cross-processor helper: hearing minutes (only valid alongside `shouldUseTaxa`). */
export function getHearingMinutesFromContext(ctx: KatsContext): number | undefined {
  return getArgrupperState(ctx)?.hearingMinutes;
}
