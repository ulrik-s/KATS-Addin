import { type KatsContext } from '../../core/context.js';
import { ProcessorError } from '../../core/errors.js';
import { type Processor, type TagName, requireTextRange, tagName } from '../../core/processor.js';
import { extractParties } from '../../domain/parties.js';
import { type KatsDocument } from '../../io/kats-document.js';
import { type KatsRange } from '../../io/kats-range.js';
import { KUND_NAMN_PLACEHOLDER, PARTY_SEPARATOR } from './schema.js';
import {
  requireYttrandeParterRead,
  requireYttrandeParterState,
  setYttrandeParterRead,
  setYttrandeParterState,
} from './state.js';

const YTTRANDE_PARTER_TAG: TagName = tagName('KATS_YTTRANDE_PARTER');

export interface YttrandeParterDependencies {
  /**
   * Document-level access. Used in `render` to replace every `[KundNamn]`
   * placeholder with the resolved left party. Drafters can scatter the
   * placeholder through body text; the replace applies globally.
   */
  readonly document: KatsDocument;
}

/**
 * Renders party dropdowns at `[[KATS_YTTRANDE_PARTER]]` and replaces the
 * `[KundNamn]` placeholder throughout the document.
 *
 * Phases:
 *   read      — capture the free-text block from the range.
 *   transform — pure parse: extract left/right party + dedupe name list
 *               (NFC / case-insensitive).
 *   render    — (a) document.replaceAll('[KundNamn]', leftParty);
 *               (b) write dropdowns into the range.
 */
export class YttrandeParterProcessor implements Processor {
  readonly tag = YTTRANDE_PARTER_TAG;
  readonly requiresRangeKind = 'text' as const;

  constructor(private readonly deps: YttrandeParterDependencies) {}

  async read(range: KatsRange, ctx: KatsContext): Promise<void> {
    const textRange = requireTextRange(range, this.tag, 'read');
    const rawText = await textRange.getText();
    setYttrandeParterRead(ctx, { rawText });
  }

  transform(ctx: KatsContext): void {
    const { rawText } = requireYttrandeParterRead(ctx);
    const { leftParty, rightParty, allNames } = extractParties(rawText);
    if (leftParty.length === 0) {
      throw new ProcessorError(
        'left party could not be extracted (first line is empty)',
        this.tag,
        'transform',
      );
    }
    const resolvedRight = rightParty.length > 0 ? rightParty : leftParty;
    // Ensure the options list contains both chosen parties.
    const options = mergeOptions(allNames, leftParty, resolvedRight);
    setYttrandeParterState(ctx, {
      leftParty,
      rightParty: resolvedRight,
      options,
    });
  }

  async render(range: KatsRange, ctx: KatsContext): Promise<void> {
    const textRange = requireTextRange(range, this.tag, 'render');
    const state = requireYttrandeParterState(ctx);

    // (a) Doc-level: replace [KundNamn] with the left party name everywhere.
    await this.deps.document.replaceAll(KUND_NAMN_PLACEHOLDER, state.leftParty);

    // (b) Range-level: two dropdowns with " ./. " between them.
    await textRange.setDropdownsSeparated(
      { options: state.options, defaultValue: state.leftParty, underlined: true },
      PARTY_SEPARATOR,
      { options: state.options, defaultValue: state.rightParty, underlined: false },
    );
  }
}

/**
 * Prepend leftParty/rightParty to the options list (first-seen-order
 * deduped) so they're always selectable, even if the drafter didn't
 * list them with a personnummer.
 */
function mergeOptions(
  names: readonly string[],
  leftParty: string,
  rightParty: string,
): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of [leftParty, rightParty, ...names]) {
    const key = candidate.normalize('NFC').toLowerCase().trim();
    if (key.length === 0) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}
