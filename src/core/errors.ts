import { type TagName, type Phase } from './processor.js';

/** Base class for all domain errors thrown by the add-in. */
export class KatsError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KatsError';
  }
}

/** Scanner failed to pair `[[KATS_*_START]]` / `[[KATS_*_END]]` markers. */
export class TagScanError extends KatsError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TagScanError';
  }
}

/** A processor threw during one of its three phases. Cause chains original. */
export class ProcessorError extends KatsError {
  readonly tag: TagName;
  readonly phase: Phase;

  constructor(message: string, tag: TagName, phase: Phase, options?: ErrorOptions) {
    super(`[${tag as string}/${phase}] ${message}`, options);
    this.name = 'ProcessorError';
    this.tag = tag;
    this.phase = phase;
  }
}

/** zod validation failed at a context slot boundary (read or transform output). */
export class ContextStateError extends KatsError {
  readonly slotKey: string;

  constructor(slotKey: string, message: string, options?: ErrorOptions) {
    super(`context slot "${slotKey}": ${message}`, options);
    this.name = 'ContextStateError';
    this.slotKey = slotKey;
  }
}
