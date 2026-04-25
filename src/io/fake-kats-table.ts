import { type TableKatsRange } from './kats-range.js';

/** Test-only TableKatsRange. Stores cells as paragraph arrays per (row, col). */
export class FakeTableKatsRange implements TableKatsRange {
  readonly kind = 'table' as const;

  private _rowCount: number;
  readonly columnCount: number;
  private readonly cells: string[][][];

  constructor(cells: readonly (readonly (readonly string[])[])[]) {
    this._rowCount = cells.length;
    this.columnCount = this._rowCount === 0 ? 0 : (cells[0]?.length ?? 0);
    if (cells.some((row) => row.length !== this.columnCount)) {
      throw new Error('FakeTableKatsRange: all rows must have the same column count');
    }
    this.cells = cells.map((row) => row.map((cell) => [...cell]));
  }

  get rowCount(): number {
    return this._rowCount;
  }

  /** Snapshot of the current cell content — used by tests. */
  snapshot(): readonly (readonly (readonly string[])[])[] {
    return this.cells.map((row) => row.map((cell) => [...cell]));
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getCellText(row: number, col: number): Promise<string> {
    this.assertBounds(row, col);
    const cell = this.cells[row]?.[col] ?? [];
    return cell.join('\r');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async setCellParagraphs(row: number, col: number, paragraphs: readonly string[]): Promise<void> {
    this.assertBounds(row, col);
    const rowArr = this.cells[row];
    if (rowArr === undefined) throw new Error(`row ${String(row)} missing`);
    rowArr[col] = [...paragraphs];
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async deleteRow(row: number): Promise<void> {
    if (row < 0 || row >= this._rowCount) {
      throw new RangeError(`row ${String(row)} out of range [0, ${String(this._rowCount)})`);
    }
    this.cells.splice(row, 1);
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
