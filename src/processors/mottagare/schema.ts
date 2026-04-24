import { z } from 'zod';

/** Context slot key for MOTTAGARE state. */
export const MOTTAGARE_STATE_KEY = 'mottagare';

/** Everything extracted from the address block plus the rendered first line. */
export const mottagareStateSchema = z.object({
  /** First non-empty line (recipient name) — used in render as first paragraph. */
  firstLine: z.string().min(1),
  /** Postort parsed from a "NNN NN CITY" line, Title-Cased, trimmed. Empty when absent. */
  postort: z.string(),
});
export type MottagareState = z.infer<typeof mottagareStateSchema>;
