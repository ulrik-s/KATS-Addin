import { z } from 'zod';

/** Context slot key for MOTTAGARE state. */
export const MOTTAGARE_STATE_KEY = 'mottagare';

/** Everything extracted from the address block plus the rendered first line. */
export const mottagareStateSchema = z.object({
  /** First non-empty line (recipient name) — used in render as first paragraph. */
  firstLine: z.string().min(1),
  /** Postort parsed from a "NNN NN CITY" line, Title-Cased, trimmed. Empty when absent. */
  postort: z.string(),
  /**
   * All non-empty address lines from the recipient block, NFC-normalized.
   * Used by render to keep the full address block intact for non-court
   * recipients. First element equals `firstLine`.
   */
  addressLines: z.array(z.string()).readonly(),
  /**
   * True when the first line looks like a court (tingsrätt, hovrätt,
   * förvaltningsrätt, kammarrätt, högsta förvaltnings-/domstolen).
   * Courts get rendered as `firstLine + "via e-post"`; everyone else
   * keeps the full address.
   */
  isCourt: z.boolean(),
});
export type MottagareState = z.infer<typeof mottagareStateSchema>;
