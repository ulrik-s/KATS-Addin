import { type KatsContext } from '../../core/context.js';
import { type Processor, tagName, type TagName } from '../../core/processor.js';
import { buildSignatureParagraphs, resolveSignatureCity } from '../../domain/signature.js';
import { type KatsUser } from '../../domain/user-db.js';
import { type KatsRange } from '../../io/kats-range.js';
import { setSignaturState, requireSignaturState } from './state.js';

const SIGNATUR_TAG: TagName = tagName('KATS_SIGNATUR');

/**
 * Everything SignaturProcessor needs from the outside world. Injected at
 * construction so tests can supply deterministic stubs.
 */
export interface SignaturDependencies {
  /** Returns "now" — tests pin to a fixed Date for stable output. */
  readonly now: () => Date;
  /** Resolved current user from the DB. */
  readonly getCurrentUser: () => KatsUser;
  /**
   * Postort set by the MOTTAGARE processor (`[[KATS_MOTTAGARE]]`).
   * Returns `undefined` when MOTTAGARE isn't in the document or hasn't
   * yet run — the transform phase handles fallback.
   */
  readonly getPostort?: () => string | undefined;
}

/**
 * Renders the attorney signature block at `[[KATS_SIGNATUR]]`.
 *
 * Phases:
 *   read      — no-op; SIGNATUR has no document input.
 *   transform — pure: resolve city, format date, build the 4 paragraphs.
 *   render    — write paragraphs to the range via `KatsRange.setParagraphs`.
 */
export class SignaturProcessor implements Processor<KatsRange> {
  readonly tag = SIGNATUR_TAG;

  constructor(private readonly deps: SignaturDependencies) {}

  read(_range: KatsRange, _ctx: KatsContext): Promise<void> {
    // SIGNATUR writes only — no document input to capture.
    return Promise.resolve();
  }

  transform(ctx: KatsContext): void {
    const user = this.deps.getCurrentUser();
    const postort = this.deps.getPostort?.();
    const city = resolveSignatureCity(postort, user.city);
    const paragraphs = buildSignatureParagraphs({
      date: this.deps.now(),
      city,
      fullName: user.fullName,
      title: user.title,
    });
    setSignaturState(ctx, { paragraphs });
  }

  async render(range: KatsRange, ctx: KatsContext): Promise<void> {
    const { paragraphs } = requireSignaturState(ctx);
    await range.setParagraphs(paragraphs);
  }
}
