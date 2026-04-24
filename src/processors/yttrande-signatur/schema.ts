import { z } from 'zod';

export const YTTRANDE_SIGNATUR_STATE_KEY = 'yttrandeSignatur';

export const yttrandeSignaturStateSchema = z.object({
  paragraphs: z.tuple([z.string(), z.string(), z.string(), z.string()]).readonly(),
});
export type YttrandeSignaturState = z.infer<typeof yttrandeSignaturStateSchema>;
