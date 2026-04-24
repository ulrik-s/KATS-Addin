import { type KatsRange } from './kats-range.js';

/**
 * Test-only KatsRange implementation. Holds paragraphs in memory; exposes
 * them via `paragraphs` for assertions. `getText()` joins with `\r` to
 * mirror Word's native paragraph-separator semantics.
 */
export class FakeKatsRange implements KatsRange {
  private _paragraphs: readonly string[];

  constructor(initial: readonly string[] = []) {
    this._paragraphs = [...initial];
  }

  get paragraphs(): readonly string[] {
    return this._paragraphs;
  }

  getText(): Promise<string> {
    return Promise.resolve(this._paragraphs.join('\r'));
  }

  setParagraphs(paragraphs: readonly string[]): Promise<void> {
    this._paragraphs = [...paragraphs];
    return Promise.resolve();
  }
}
