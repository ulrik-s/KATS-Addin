import { type KatsContext } from '../../core/context.js';
import {
  YTTRANDE_PARTER_READ_KEY,
  YTTRANDE_PARTER_STATE_KEY,
  yttrandeParterReadSchema,
  yttrandeParterStateSchema,
  type YttrandeParterRead,
  type YttrandeParterState,
} from './schema.js';

export function getYttrandeParterRead(ctx: KatsContext): YttrandeParterRead | undefined {
  return ctx.getSlot(YTTRANDE_PARTER_READ_KEY, yttrandeParterReadSchema);
}

export function setYttrandeParterRead(ctx: KatsContext, read: YttrandeParterRead): void {
  ctx.setSlot(YTTRANDE_PARTER_READ_KEY, yttrandeParterReadSchema, read);
}

export function requireYttrandeParterRead(ctx: KatsContext): YttrandeParterRead {
  return ctx.requireSlot(YTTRANDE_PARTER_READ_KEY, yttrandeParterReadSchema);
}

export function getYttrandeParterState(ctx: KatsContext): YttrandeParterState | undefined {
  return ctx.getSlot(YTTRANDE_PARTER_STATE_KEY, yttrandeParterStateSchema);
}

export function setYttrandeParterState(ctx: KatsContext, state: YttrandeParterState): void {
  ctx.setSlot(YTTRANDE_PARTER_STATE_KEY, yttrandeParterStateSchema, state);
}

export function requireYttrandeParterState(ctx: KatsContext): YttrandeParterState {
  return ctx.requireSlot(YTTRANDE_PARTER_STATE_KEY, yttrandeParterStateSchema);
}
