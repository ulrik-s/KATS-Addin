import { z } from 'zod';

export const ARGRUPPER_READ_KEY = 'argrupper.read';
export const ARGRUPPER_STATE_KEY = 'argrupper';

/** Section heading labels — matched loose-equality against col 0. */
export const ARGRUPPER_SECTIONS = {
  arvode: 'Arvode',
  arvodeHelg: 'Arvode helg',
  tidsspillan: 'Tidsspillan',
  tidsspillanOvrigTid: 'Tidsspillan övrig tid',
} as const;

/** The label of the row whose date/time/qty cells get cleared after parsing. */
export const ARENDE_TOTAL_LABEL = 'Ärende, total';

/** Hours column in section data rows (0-indexed). */
export const ARGRUPPER_HOURS_COL = 2;

const cellSchema = z.array(z.string()).readonly();
const rowSchema = z.array(cellSchema).readonly();

export const argrupperReadSchema = z.object({
  cells: z.array(rowSchema).readonly(),
});
export type ArgrupperRead = z.infer<typeof argrupperReadSchema>;

const cellPatchSchema = z.object({
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  paragraphs: cellSchema,
});
export type CellPatch = z.infer<typeof cellPatchSchema>;

export const categoryHoursSchema = z.object({
  arvode: z.number().nonnegative(),
  arvodeHelg: z.number().nonnegative(),
  tidsspillan: z.number().nonnegative(),
  tidsspillanOvrigTid: z.number().nonnegative(),
});
export type CategoryHours = z.infer<typeof categoryHoursSchema>;

export const argrupperStateSchema = z.object({
  hours: categoryHoursSchema,
  isTaxemal: z.boolean(),
  /** Hearing start datetime; undefined if no hearing line found. */
  hearingStart: z.date().optional(),
  /** Minutes from hearingStart to "now"; undefined if hearingStart is. */
  hearingMinutes: z.number().int().nonnegative().optional(),
  patches: z.array(cellPatchSchema).readonly(),
});
export type ArgrupperState = z.infer<typeof argrupperStateSchema>;
