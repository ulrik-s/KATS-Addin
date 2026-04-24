/**
 * Thin abstraction over Word.Range so processors and their tests do not
 * depend on Office JS directly. Fas 5 introduces a `WordKatsRange` adapter
 * that implements this against a real `Word.Range` inside `Word.run()`.
 *
 * Keep the interface minimal — every method here costs one-for-one in
 * Office JS round-trips (each call batches inside the caller's run-block).
 */
export interface KatsRange {
  /** Full text content as a single string with `\r` between paragraphs. */
  getText(): Promise<string>;

  /**
   * Replace the range's entire content with these paragraphs.
   *
   * Each string becomes one paragraph in Word. Empty strings produce
   * empty paragraphs (= visual blank lines). The caller passes the
   * paragraphs already NFC-normalized (see `domain/swedish-text`).
   */
  setParagraphs(paragraphs: readonly string[]): Promise<void>;
}
