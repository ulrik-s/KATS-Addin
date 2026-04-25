import { z } from 'zod';

export const UTLAGG_READ_KEY = 'utlagg.read';
export const UTLAGG_STATE_KEY = 'utlagg';

/** Section heading labels (matched loose-equality against col 0). */
export const UTLAGG_SECTION_VAT = 'Utlägg';
export const UTLAGG_SECTION_NO_VAT = 'Utlägg momsfri';

/** Column indices in the 5-column expense table. */
export const UTLAGG_COL = {
  date: 0,
  description: 1,
  quantity: 2,
  rate: 3,
  amount: 4,
} as const;

const cellSchema = z.array(z.string()).readonly();
const rowSchema = z.array(cellSchema).readonly();

/** Snapshot of the table cells captured at read-time. */
export const utlaggReadSchema = z.object({
  /** Original cell content. cells[row][col] = paragraphs. */
  cells: z.array(rowSchema).readonly(),
});
export type UtlaggRead = z.infer<typeof utlaggReadSchema>;

const cellPatchSchema = z.object({
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  paragraphs: cellSchema,
});
export type CellPatch = z.infer<typeof cellPatchSchema>;

/** What the render phase will write — cell-by-cell patches. */
export const utlaggStateSchema = z.object({
  patches: z.array(cellPatchSchema).readonly(),
  /** Section totals in kronor (rounded to whole kronor, parity with VBA). */
  totalExMomsKr: z.number(),
  totalEjMomsKr: z.number(),
});
export type UtlaggState = z.infer<typeof utlaggStateSchema>;
