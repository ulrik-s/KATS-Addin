import { type KatsContext } from '../../core/context.js';
import {
  YTTRANDE_SIGNATUR_STATE_KEY,
  yttrandeSignaturStateSchema,
  type YttrandeSignaturState,
} from './schema.js';

export function getYttrandeSignaturState(ctx: KatsContext): YttrandeSignaturState | undefined {
  return ctx.getSlot(YTTRANDE_SIGNATUR_STATE_KEY, yttrandeSignaturStateSchema);
}

export function requireYttrandeSignaturState(ctx: KatsContext): YttrandeSignaturState {
  return ctx.requireSlot(YTTRANDE_SIGNATUR_STATE_KEY, yttrandeSignaturStateSchema);
}

export function setYttrandeSignaturState(ctx: KatsContext, state: YttrandeSignaturState): void {
  ctx.setSlot(YTTRANDE_SIGNATUR_STATE_KEY, yttrandeSignaturStateSchema, state);
}
