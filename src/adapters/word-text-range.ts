import { type DropdownSpec, type TextKatsRange } from '../io/kats-range.js';

/**
 * Office JS adapter implementing TextKatsRange against a Word.Range.
 *
 * Each method is async to match the contract; under the hood it
 * batches Office JS calls inside the caller's `Word.run()` block. The
 * caller therefore gets one round-trip per method call (one for read,
 * one for write) rather than one per cell as a naive port would do.
 *
 * `setDropdownsSeparated` collapses the range to its start, then
 * inserts content controls in document order: left dropdown,
 * separator text, right dropdown. Existing range content is cleared
 * first.
 */
export class WordTextKatsRange implements TextKatsRange {
  readonly kind = 'text' as const;

  constructor(private readonly range: Word.Range) {}

  async getText(): Promise<string> {
    this.range.load('text');
    await this.range.context.sync();
    return this.range.text;
  }

  async setParagraphs(paragraphs: readonly string[]): Promise<void> {
    if (paragraphs.length === 0) {
      this.range.clear();
      await this.range.context.sync();
      return;
    }
    // Word treats `\r` as a paragraph break inside `insertText`.
    const joined = paragraphs.join('\r');
    this.range.insertText(joined, Word.InsertLocation.replace);
    await this.range.context.sync();
  }

  async setDropdownsSeparated(
    left: DropdownSpec,
    separator: string,
    right: DropdownSpec,
  ): Promise<void> {
    const ctx = this.range.context;

    // Clear and shrink to the original start.
    this.range.clear();
    const cursor = this.range.getRange(Word.RangeLocation.start);

    // Insert in order: left dropdown → separator text → right dropdown.
    const leftRange = cursor.insertText(left.defaultValue, Word.InsertLocation.after);
    if (left.underlined) leftRange.font.underline = Word.UnderlineType.single;
    const leftCC = leftRange.insertContentControl();
    configureDropdown(leftCC, left);

    const sepRange = leftRange.insertText(separator, Word.InsertLocation.after);
    sepRange.font.underline = Word.UnderlineType.none;

    const rightRange = sepRange.insertText(right.defaultValue, Word.InsertLocation.after);
    if (right.underlined) rightRange.font.underline = Word.UnderlineType.single;
    const rightCC = rightRange.insertContentControl();
    configureDropdown(rightCC, right);

    await ctx.sync();
  }
}

function configureDropdown(cc: Word.ContentControl, spec: DropdownSpec): void {
  cc.title = 'KATS-part';
  cc.appearance = Word.ContentControlAppearance.boundingBox;
  cc.tag = 'kats-party-dropdown';
  // The dropdown items live on the dropdownListContentControl proxy
  // via the underlying CC. Office JS exposes it as `dropDownList` on
  // ContentControl in newer requirement sets; on older sets this
  // gracefully falls through to a free-text content control with the
  // default value.
  const ddl = (cc as unknown as { dropDownList?: Word.DropDownListContentControl }).dropDownList;
  if (ddl !== undefined) {
    // Clear any pre-existing entries first (defensive).
    ddl.deleteAllListItems();
    for (const option of spec.options) {
      ddl.addListItem(option, option, undefined);
    }
  }
}
