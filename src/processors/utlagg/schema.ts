import { z } from 'zod';
import type { LabelSpec } from '../../domain/swedish-text.js';

export const UTLAGG_READ_KEY = 'utlagg.read';
export const UTLAGG_STATE_KEY = 'utlagg';

/**
 * Section heading specs — primary form is the canonical Swedish KATS
 * template heading, aliases are tolerated when drafters have translated
 * or otherwise drifted the heading. Any cell whose trimmed text
 * loose-matches *any* variant counts as the heading.
 */
export const UTLAGG_SECTION_VAT: LabelSpec = {
  primary: 'Utlägg',
  aliases: ['Expenses', 'Expense', 'Disbursements', 'Outlay'],
};

export const UTLAGG_SECTION_NO_VAT: LabelSpec = {
  primary: 'Utlägg momsfri',
  aliases: [
    'Utlägg, momsfri',
    'Utlägg utan moms',
    'VAT-free expenses',
    'Expenses, VAT-free',
    'Tax-free expenses',
    'Expenses no VAT',
    'Expenses without VAT',
  ],
};

/** Summary row label: trimmed col-0 text after the section heading. */
export const UTLAGG_SUMMARY_LABEL: LabelSpec = {
  primary: 'Summa',
  aliases: ['Total', 'Totalt', 'Sum', 'Subtotal', 'Sum total'],
};

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
  /** User-facing diagnostic messages — see ArgrupperState.warnings. */
  warnings: z.array(z.string()).readonly(),
});
export type UtlaggState = z.infer<typeof utlaggStateSchema>;
