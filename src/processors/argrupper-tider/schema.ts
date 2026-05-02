import { z } from 'zod';
import type { LabelSpec } from '../../domain/swedish-text.js';

export const ARGRUPPER_READ_KEY = 'argrupper.read';
export const ARGRUPPER_STATE_KEY = 'argrupper';

/**
 * Section heading specs — primary form is what the canonical Swedish
 * KATS template uses; aliases are tolerated when drafters have
 * translated, abbreviated, or otherwise drifted the heading. Any cell
 * whose trimmed text loose-matches *any* variant is treated as the
 * heading. The primary form is what gets shown back in diagnostic
 * messages.
 */
export const ARGRUPPER_SECTIONS: {
  readonly arvode: LabelSpec;
  readonly arvodeHelg: LabelSpec;
  readonly tidsspillan: LabelSpec;
  readonly tidsspillanOvrigTid: LabelSpec;
} = {
  arvode: { primary: 'Arvode', aliases: ['Fee', 'Fees', 'Honorarium'] },
  arvodeHelg: {
    primary: 'Arvode helg',
    aliases: ['Fee weekend', 'Weekend fee', 'Fees weekend', 'Helgarvode'],
  },
  tidsspillan: {
    primary: 'Tidsspillan',
    aliases: ['Time loss', 'Wait time', 'Travel time', 'Lost time'],
  },
  tidsspillanOvrigTid: {
    primary: 'Tidsspillan övrig tid',
    aliases: [
      'Tidsspillan övrigt',
      'Other time loss',
      'Time loss other',
      'Other wait time',
      'Time loss other time',
    ],
  },
} as const;

/** Summary row label: trimmed col-0 text after the section heading. */
export const ARGRUPPER_SUMMARY_LABEL: LabelSpec = {
  primary: 'Summa',
  aliases: ['Total', 'Totalt', 'Sum', 'Subtotal', 'Sum total'],
};

/** The label of the row whose date/time/qty cells get cleared after parsing. */
export const ARENDE_TOTAL_LABEL: LabelSpec = {
  primary: 'Ärende, total',
  aliases: ['Ärende total', 'Case, total', 'Case total', 'Total case', 'Total, case'],
};

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
  /**
   * User-facing diagnostic messages emitted during transform — flagged
   * up by the processor for the orchestrator to surface in the task
   * pane. Empty when the table conformed to the expected shape.
   */
  warnings: z.array(z.string()).readonly(),
});
export type ArgrupperState = z.infer<typeof argrupperStateSchema>;
