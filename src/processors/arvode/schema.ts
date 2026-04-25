import { z } from 'zod';

export const ARVODE_READ_KEY = 'arvode.read';
export const ARVODE_STATE_KEY = 'arvode';

/**
 * Fixed row layout (0-indexed). VBA used 1-indexed; subtract 1.
 *
 *   row 0: header
 *   row 1: Arvode
 *   row 2: Arvode helg
 *   row 3: Tidsspillan
 *   row 4: Tidsspillan övrig tid
 *   row 5: Utlägg
 */
export const ARVODE_ROW = {
  header: 0,
  arvode: 1,
  arvodeHelg: 2,
  tidsspillan: 3,
  tidsspillanOvrigTid: 4,
  utlagg: 5,
} as const;

/** Column indices: 0 label, 1 spec, 2 amount. */
export const ARVODE_COL = {
  label: 0,
  spec: 1,
  amount: 2,
} as const;

const cellSchema = z.array(z.string()).readonly();
const rowSchema = z.array(cellSchema).readonly();

export const arvodeReadSchema = z.object({
  cells: z.array(rowSchema).readonly(),
});
export type ArvodeRead = z.infer<typeof arvodeReadSchema>;

const cellPatchSchema = z.object({
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  paragraphs: cellSchema,
});
export type CellPatch = z.infer<typeof cellPatchSchema>;

export const arvodeStateSchema = z.object({
  patches: z.array(cellPatchSchema).readonly(),
  /** Row indices to delete (in the *original* table). Render sorts descending. */
  rowsToDelete: z.array(z.number().int().nonnegative()).readonly(),
  /** Total ex moms in kronor (rounded to 2 decimals at boundary). */
  totalExMomsKr: z.number(),
});
export type ArvodeState = z.infer<typeof arvodeStateSchema>;
