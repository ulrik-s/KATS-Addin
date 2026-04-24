import { type KatsContext } from '../../core/context.js';
import { type Processor, type TagName, requireTextRange, tagName } from '../../core/processor.js';
import { buildSignatureParagraphs, resolveSignatureCity } from '../../domain/signature.js';
import { type KatsUser } from '../../domain/user-db.js';
import { type KatsRange } from '../../io/kats-range.js';
import { getPostortFromContext } from '../mottagare/state.js';
import { requireSignaturState, setSignaturState } from './state.js';

const SIGNATUR_TAG: TagName = tagName('KATS_SIGNATUR');

/**
 * What SignaturProcessor needs from the outside world. Cross-processor
 * data (postort from MOTTAGARE) flows through KatsContext, not through
 * constructor dependencies.
 */
export interface SignaturDependencies {
  /** Returns "now" — tests pin to a fixed Date for stable output. */
  readonly now: () => Date;
  /** Resolved current user from the DB. */
  readonly getCurrentUser: () => KatsUser;
}

/**
 * Renders the attorney signature block at `[[KATS_SIGNATUR]]`.
 *
 * Phases:
 *   read      — no-op; SIGNATUR has no document input.
 *   transform — resolve city (postort-from-ctx → user.city → "Lund"),
 *               format date, build the 4 paragraphs. No Office JS.
 *   render    — write paragraphs to the text range.
 */
export class SignaturProcessor implements Processor {
  readonly tag = SIGNATUR_TAG;

  constructor(private readonly deps: SignaturDependencies) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(range: KatsRange, _ctx: KatsContext): Promise<void> {
    // Validate range shape even though we don't read from it — a
    // table-shaped `[[KATS_SIGNATUR]]` is almost certainly a mistake.
    // `async` ensures a sync throw inside `requireTextRange` becomes
    // a promise rejection, matching the pipeline's error-wrapping contract.
    requireTextRange(range, this.tag, 'read');
  }

  transform(ctx: KatsContext): void {
    const user = this.deps.getCurrentUser();
    const postort = getPostortFromContext(ctx);
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
    const textRange = requireTextRange(range, this.tag, 'render');
    const { paragraphs } = requireSignaturState(ctx);
    await textRange.setParagraphs(paragraphs);
  }
}
