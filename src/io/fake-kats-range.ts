import { type DropdownSpec, type TextKatsRange } from './kats-range.js';

/**
 * Test-only TextKatsRange. Holds paragraphs in memory; additionally
 * records dropdown specs for processors that build content controls
 * (YTTRANDE_PARTER), so tests can assert on what was written.
 */
export class FakeTextKatsRange implements TextKatsRange {
  readonly kind = 'text' as const;

  private _paragraphs: readonly string[];
  private _dropdowns: DropdownRenderRecord | undefined;

  constructor(initial: readonly string[] = []) {
    this._paragraphs = [...initial];
  }

  get paragraphs(): readonly string[] {
    return this._paragraphs;
  }

  /** The last `setDropdownsSeparated` call, or undefined if never called. */
  get dropdowns(): DropdownRenderRecord | undefined {
    return this._dropdowns;
  }

  getText(): Promise<string> {
    return Promise.resolve(this._paragraphs.join('\r'));
  }

  setParagraphs(paragraphs: readonly string[]): Promise<void> {
    this._paragraphs = [...paragraphs];
    this._dropdowns = undefined;
    return Promise.resolve();
  }

  setDropdownsSeparated(left: DropdownSpec, separator: string, right: DropdownSpec): Promise<void> {
    this._paragraphs = [];
    this._dropdowns = {
      left: cloneDropdown(left),
      separator,
      right: cloneDropdown(right),
    };
    return Promise.resolve();
  }
}

export interface DropdownRenderRecord {
  readonly left: DropdownSpec;
  readonly separator: string;
  readonly right: DropdownSpec;
}

function cloneDropdown(spec: DropdownSpec): DropdownSpec {
  return {
    options: [...spec.options],
    defaultValue: spec.defaultValue,
    underlined: spec.underlined,
  };
}
