import { type TableKatsRange } from '../io/kats-range.js';

/**
 * Office JS adapter implementing TableKatsRange against a Word.Table.
 *
 * Reads come from a snapshot taken at scanner time (Word's
 * `table.values`); writes go through Word.js. This avoids per-cell
 * `sync()` round-trips and — importantly — handles merged-cell rows
 * gracefully: a heading row that spans all columns has `values[r]`
 * with length 1, so `getCellText(r, col≥1)` returns "" instead of
 * crashing on `getCell()`.
 *
 * Writes still use the live `Word.Table` so render-phase output
 * lands in the document. If a processor tries to write to a column
 * that doesn't exist in the actual row (e.g. a merged heading row),
 * Word.js throws and we let it bubble — that signals a programmer
 * bug in the processor, not a data quirk.
 */
export class WordTableKatsRange implements TableKatsRange {
  readonly kind = 'table' as const;

  private _rowCount: number;
  readonly columnCount: number;
  private readonly cachedValues: string[][];

  /**
   * Caller must `load("rowCount, values")` and `sync()` on `table`
   * before passing it in, and pass `cachedValues` from `table.values`.
   * The constructor does NOT make Office JS calls so the caller
   * controls the sync points.
   *
   * @param columnCount logical column count — typically `max(row.length)`
   *                    over all rows. Heading rows with merged cells
   *                    have row.length=1 but the table is still e.g. 5
   *                    columns wide.
   */
  constructor(
    private readonly table: Word.Table,
    rowCount: number,
    columnCount: number,
    cachedValues: readonly (readonly string[])[],
  ) {
    this._rowCount = rowCount;
    this.columnCount = columnCount;
    this.cachedValues = cachedValues.map((row) => [...row]);
  }

  get rowCount(): number {
    return this._rowCount;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getCellText(row: number, col: number): Promise<string> {
    if (row < 0 || row >= this._rowCount) {
      throw new RangeError(`row ${String(row)} out of range [0, ${String(this._rowCount)})`);
    }
    if (col < 0) {
      throw new RangeError(`col ${String(col)} cannot be negative`);
    }
    // No upper-bound col check on purpose — merged-cell rows have
    // fewer physical cells than the table's logical column count, and
    // returning "" for "missing" cells is the right semantic for a
    // snapshot read.
    return this.cachedValues[row]?.[col] ?? '';
  }

  async setCellParagraphs(row: number, col: number, paragraphs: readonly string[]): Promise<void> {
    if (row < 0 || row >= this._rowCount) {
      throw new RangeError(`row ${String(row)} out of range [0, ${String(this._rowCount)})`);
    }
    if (col < 0) {
      throw new RangeError(`col ${String(col)} cannot be negative`);
    }
    const cell = this.table.getCell(row, col);
    if (paragraphs.length === 0) {
      cell.body.clear();
    } else {
      cell.body.insertText(paragraphs.join('\r'), Word.InsertLocation.replace);
    }
    await cell.context.sync();
    // Keep cache consistent with the document so subsequent reads from
    // this same KatsRange in the same pipeline run see the new value.
    const cachedRow = this.cachedValues[row] ?? [];
    while (cachedRow.length <= col) cachedRow.push('');
    cachedRow[col] = paragraphs.join('\r');
    this.cachedValues[row] = cachedRow;
  }

  async deleteRow(row: number): Promise<void> {
    if (row < 0 || row >= this._rowCount) {
      throw new RangeError(`row ${String(row)} out of range [0, ${String(this._rowCount)})`);
    }
    const rows = this.table.rows;
    rows.load('items');
    await this.table.context.sync();
    const target = rows.items[row];
    if (!target) throw new RangeError(`row ${String(row)} unexpectedly missing`);
    target.delete();
    await this.table.context.sync();
    this._rowCount -= 1;
    this.cachedValues.splice(row, 1);
  }
}
