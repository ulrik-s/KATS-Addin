import { type KatsContext } from '../../core/context.js';
import { SIGNATUR_STATE_KEY, signaturStateSchema, type SignaturState } from './schema.js';

/** Typed read of this processor's slot. `undefined` if transform hasn't run. */
export function getSignaturState(ctx: KatsContext): SignaturState | undefined {
  return ctx.getSlot(SIGNATUR_STATE_KEY, signaturStateSchema);
}

/** Typed required read — throws `ContextStateError` if slot is missing. */
export function requireSignaturState(ctx: KatsContext): SignaturState {
  return ctx.requireSlot(SIGNATUR_STATE_KEY, signaturStateSchema);
}

/** Typed write — validated by the schema at the context boundary. */
export function setSignaturState(ctx: KatsContext, state: SignaturState): void {
  ctx.setSlot(SIGNATUR_STATE_KEY, signaturStateSchema, state);
}
