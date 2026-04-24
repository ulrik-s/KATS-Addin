import { type KatsContext } from '../../core/context.js';
import { type Processor, type TagName, requireTextRange, tagName } from '../../core/processor.js';
import { buildSignatureParagraphs, resolveSignatureCity } from '../../domain/signature.js';
import { type KatsUser } from '../../domain/user-db.js';
import { type KatsRange } from '../../io/kats-range.js';
import { requireYttrandeSignaturState, setYttrandeSignaturState } from './state.js';

const YTTRANDE_SIGNATUR_TAG: TagName = tagName('KATS_YTTRANDE_SIGNATUR');

export interface YttrandeSignaturDependencies {
  readonly now: () => Date;
  readonly getCurrentUser: () => KatsUser;
}

/**
 * Renders the attorney signature block at `[[KATS_YTTRANDE_SIGNATUR]]`.
 *
 * Identical to SIGNATUR except: the city comes from `user.city` (falling
 * back to "Lund"). It does NOT look at MOTTAGARE's postort — YTTRANDE
 * documents typically don't have a MOTTAGARE tag, and even when they do
 * the semantic is different (opinions are signed from the firm's own
 * office, not "from the court we're writing to").
 */
export class YttrandeSignaturProcessor implements Processor {
  readonly tag = YTTRANDE_SIGNATUR_TAG;

  constructor(private readonly deps: YttrandeSignaturDependencies) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async read(range: KatsRange, _ctx: KatsContext): Promise<void> {
    requireTextRange(range, this.tag, 'read');
  }

  transform(ctx: KatsContext): void {
    const user = this.deps.getCurrentUser();
    const city = resolveSignatureCity(undefined, user.city); // note: no postort lookup
    const paragraphs = buildSignatureParagraphs({
      date: this.deps.now(),
      city,
      fullName: user.fullName,
      title: user.title,
    });
    setYttrandeSignaturState(ctx, { paragraphs });
  }

  async render(range: KatsRange, ctx: KatsContext): Promise<void> {
    const textRange = requireTextRange(range, this.tag, 'render');
    const { paragraphs } = requireYttrandeSignaturState(ctx);
    await textRange.setParagraphs(paragraphs);
  }
}
