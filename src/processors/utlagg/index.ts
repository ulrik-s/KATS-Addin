export { UtlaggProcessor, type UtlaggDependencies } from './processor.js';
export {
  UTLAGG_COL,
  UTLAGG_READ_KEY,
  UTLAGG_SECTION_NO_VAT,
  UTLAGG_SECTION_VAT,
  UTLAGG_STATE_KEY,
  UTLAGG_SUMMARY_LABEL,
  utlaggReadSchema,
  utlaggStateSchema,
  type CellPatch,
  type UtlaggRead,
  type UtlaggState,
} from './schema.js';
export {
  getUtlaggRead,
  getUtlaggState,
  getUtlaggTotalsFromContext,
  requireUtlaggRead,
  requireUtlaggState,
  setUtlaggRead,
  setUtlaggState,
} from './state.js';
export { computeUtlagg, type ComputeUtlaggInput } from './transform.js';
