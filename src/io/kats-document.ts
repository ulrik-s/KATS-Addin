/**
 * Document-level operations. Separate from `KatsRange` because the tag
 * markers define only a sub-range of the document — but some processors
 * (YTTRANDE_PARTER) need to act across the entire body (replacing
 * `[KundNamn]` placeholders anywhere the drafter put them).
 *
 * Fas 5 provides a `WordKatsDocument` adapter over `Word.Document`.
 */
export interface KatsDocument {
  /** Replace every literal occurrence of `search` with `replacement`. Returns the number of replacements. */
  replaceAll(search: string, replacement: string): Promise<number>;
}
