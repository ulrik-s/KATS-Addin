import { z } from 'zod';

export const ARVODE_TOTAL_READ_KEY = 'arvodeTotal.read';
export const ARVODE_TOTAL_STATE_KEY = 'arvodeTotal';

/** Row labels matched (loose) against col 0 to find each summary row. */
export const ARVODE_TOTAL_LABELS = {
  exMoms: 'Belopp exkl. moms',
  moms: 'Moms (25%)',
  utlaggEjMoms: 'GG EJ MOMS',
  inkl: 'Belopp inkl. moms',
} as const;

/** Output column for amounts. */
export const ARVODE_TOTAL_AMOUNT_COL = 2;

/** VAT rate used for the moms calculation. */
export const VAT_RATE = 0.25;

const cellSchema = z.array(z.string()).readonly();
const rowSchema = z.array(cellSchema).readonly();

export const arvodeTotalReadSchema = z.object({
  cells: z.array(rowSchema).readonly(),
  /** -1 when the label was not found. */
  rowExMoms: z.number().int(),
  rowMoms: z.number().int(),
  rowUtlaggEjMoms: z.number().int(),
  rowInkl: z.number().int(),
});
export type ArvodeTotalRead = z.infer<typeof arvodeTotalReadSchema>;

const cellPatchSchema = z.object({
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  paragraphs: cellSchema,
});
export type CellPatch = z.infer<typeof cellPatchSchema>;

export const arvodeTotalStateSchema = z.object({
  patches: z.array(cellPatchSchema).readonly(),
  rowsToDelete: z.array(z.number().int().nonnegative()).readonly(),
  arvodeExMomsKr: z.number(),
  momsKr: z.number(),
  utlaggEjMomsKr: z.number(),
  inklKr: z.number(),
});
export type ArvodeTotalState = z.infer<typeof arvodeTotalStateSchema>;
