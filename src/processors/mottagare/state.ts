import { type KatsContext } from '../../core/context.js';
import { MOTTAGARE_STATE_KEY, mottagareStateSchema, type MottagareState } from './schema.js';

/** Typed read. `undefined` when MOTTAGARE didn't run (no tag in document). */
export function getMottagareState(ctx: KatsContext): MottagareState | undefined {
  return ctx.getSlot(MOTTAGARE_STATE_KEY, mottagareStateSchema);
}

export function requireMottagareState(ctx: KatsContext): MottagareState {
  return ctx.requireSlot(MOTTAGARE_STATE_KEY, mottagareStateSchema);
}

export function setMottagareState(ctx: KatsContext, state: MottagareState): void {
  ctx.setSlot(MOTTAGARE_STATE_KEY, mottagareStateSchema, state);
}

/** Convenience cross-processor helper: fetch just the postort, if MOTTAGARE ran. */
export function getPostortFromContext(ctx: KatsContext): string | undefined {
  const state = getMottagareState(ctx);
  if (!state) return undefined;
  return state.postort.length > 0 ? state.postort : undefined;
}
