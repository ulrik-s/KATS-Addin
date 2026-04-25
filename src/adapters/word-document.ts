import { type KatsDocument } from '../io/kats-document.js';

/**
 * Office JS adapter for `KatsDocument`. Replaces every literal
 * occurrence of `search` in the active document body with `replacement`.
 *
 * Implementation uses Word.Body.search with `matchCase: true` and the
 * literal-match flags Office JS supports. Each found range is then
 * replaced via `insertText`. Returns the count of replacements.
 */
export class WordKatsDocument implements KatsDocument {
  constructor(private readonly body: Word.Body) {}

  async replaceAll(search: string, replacement: string): Promise<number> {
    if (search.length === 0) return 0;
    const ctx = this.body.context;
    const matches = this.body.search(search, {
      matchCase: true,
      matchWholeWord: false,
      matchPrefix: false,
      matchSuffix: false,
      matchWildcards: false,
      ignorePunct: false,
      ignoreSpace: false,
    });
    matches.load('items');
    await ctx.sync();

    const count = matches.items.length;
    for (const match of matches.items) {
      match.insertText(replacement, Word.InsertLocation.replace);
    }
    await ctx.sync();
    return count;
  }
}
