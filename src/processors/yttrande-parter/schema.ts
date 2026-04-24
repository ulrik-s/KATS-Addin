import { z } from 'zod';

export const YTTRANDE_PARTER_STATE_KEY = 'yttrandeParter';

/** The placeholder VBA replaces throughout the document body. */
export const KUND_NAMN_PLACEHOLDER = '[KundNamn]';

/** Separator between the two dropdowns in the rendered heading. */
export const PARTY_SEPARATOR = ' ./. ';

/** Populated by transform, consumed by render. */
export const yttrandeParterStateSchema = z.object({
  leftParty: z.string().min(1),
  rightParty: z.string().min(1),
  /** Names to offer in both dropdowns, first-seen order, NFC-normalized. */
  options: z.array(z.string()).readonly(),
});
export type YttrandeParterState = z.infer<typeof yttrandeParterStateSchema>;

/** Parsed intermediate state populated by read — consumed by transform. */
export const yttrandeParterReadSchema = z.object({
  rawText: z.string(),
});
export type YttrandeParterRead = z.infer<typeof yttrandeParterReadSchema>;

export const YTTRANDE_PARTER_READ_KEY = 'yttrandeParter.read';
