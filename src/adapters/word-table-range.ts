import { type TableKatsRange } from '../io/kats-range.js';

/**
 * Office JS adapter implementing TableKatsRange against a Word.Table.
 *
 * Each cell read/write costs one sync(); processors batch their patch
 * lists in render so we keep the round-trip count linear in the
 * number of patches, not the number of cells.
 */
export class WordTableKatsRange implements TableKatsRange {
  readonly kind = 'table' as const;

  private _rowCount: number;
  readonly columnCount: number;

  /**
   * Caller must `load("rowCount, columnCount")` and `sync()` on `table`
   * before passing it in. The constructor does NOT make Office JS
   * calls so the caller controls the sync points.
   */
  constructor(
    private readonly table: Word.Table,
    rowCount: number,
    columnCount: number,
  ) {
    this._rowCount = rowCount;
    this.columnCount = columnCount;
  }

  get rowCount(): number {
    return this._rowCount;
  }

  async getCellText(row: number, col: number): Promise<string> {
    this.assertBounds(row, col);
    const cell = this.table.getCell(row, col);
    cell.body.load('text');
    await cell.context.sync();
    return cell.body.text;
  }

  async setCellParagraphs(row: number, col: number, paragraphs: readonly string[]): Promise<void> {
    this.assertBounds(row, col);
    const cell = this.table.getCell(row, col);
    if (paragraphs.length === 0) {
      cell.body.clear();
    } else {
      cell.body.insertText(paragraphs.join('\r'), Word.InsertLocation.replace);
    }
    await cell.context.sync();
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
  }

  private assertBounds(row: number, col: number): void {
    if (row < 0 || row >= this._rowCount) {
      throw new RangeError(`row ${String(row)} out of range [0, ${String(this._rowCount)})`);
    }
    if (col < 0 || col >= this.columnCount) {
      throw new RangeError(`col ${String(col)} out of range [0, ${String(this.columnCount)})`);
    }
  }
}
