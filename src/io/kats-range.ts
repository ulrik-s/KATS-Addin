/**
 * Range abstractions over Word.Range. Processors depend on these
 * interfaces, never on Office JS directly, so every processor is
 * testable with an in-memory fake.
 *
 * The `kind` discriminator lets a processor receive a `KatsRange` at the
 * pipeline boundary and narrow to its expected shape via helpers in
 * `core/processor.ts`. Attempting to pass a table range to a text-only
 * processor (or vice versa) is a typed, loud runtime error.
 *
 * Fas 5 introduces `WordTextKatsRange` / `WordTableKatsRange` adapters
 * that implement these against real `Word.Range` objects inside
 * `Word.run()`. The interfaces intentionally map one method call ≈ one
 * Office JS round-trip.
 */

/** Plain-text-span range — SIGNATUR, YTTRANDE_*. */
export interface TextKatsRange {
  readonly kind: 'text';

  /** Full text content as a single string with `\r` between paragraphs. */
  getText(): Promise<string>;

  /**
   * Replace the range's entire content with these paragraphs. Each string
   * becomes one Word paragraph; empty strings produce blank lines. The
   * caller passes paragraphs already NFC-normalized.
   */
  setParagraphs(paragraphs: readonly string[]): Promise<void>;

  /**
   * Replace the range with a left dropdown + a literal separator text +
   * a right dropdown. Used by YTTRANDE_PARTER to build case-heading
   * party pickers in Word content controls.
   */
  setDropdownsSeparated(left: DropdownSpec, separator: string, right: DropdownSpec): Promise<void>;
}

/** Specification for a single dropdown content control. */
export interface DropdownSpec {
  readonly options: readonly string[];
  readonly defaultValue: string;
  readonly underlined: boolean;
}

/** Table range — MOTTAGARE, UTLAGG, ARVODE, ARVODE_TOTAL, ARGRUPPER. */
export interface TableKatsRange {
  readonly kind: 'table';

  readonly rowCount: number;
  readonly columnCount: number;

  /** Read text from a 0-indexed cell. Throws if row/col out of range. */
  getCellText(row: number, col: number): Promise<string>;

  /**
   * Replace a cell's content with the given paragraphs. Throws if
   * row/col out of range. Each paragraph is NFC-normalized by the caller.
   */
  setCellParagraphs(row: number, col: number, paragraphs: readonly string[]): Promise<void>;

  /**
   * Delete a row by 0-based index. Subsequent row indices shift down by
   * one. Used by ARVODE and ARVODE_TOTAL to drop zero-amount rows.
   */
  deleteRow(row: number): Promise<void>;
}

/** Unified range type — every processor accepts this and narrows. */
export type KatsRange = TextKatsRange | TableKatsRange;
