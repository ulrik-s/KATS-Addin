import { z } from 'zod';

/** Context slot key for SIGNATUR state. */
export const SIGNATUR_STATE_KEY = 'signatur';

/**
 * Filled by `transform`, consumed by `render`. Exactly four paragraphs:
 * date line, blank, full name, title. The fixed length is enforced by
 * the schema so a render-time mismatch fails loud at the context boundary.
 */
export const signaturStateSchema = z.object({
  paragraphs: z.tuple([z.string(), z.string(), z.string(), z.string()]).readonly(),
});
export type SignaturState = z.infer<typeof signaturStateSchema>;
