import { FIRST_PAGE_FOOTER_HTML, FIRST_PAGE_HEADER_HTML } from './templates.js';

/**
 * Replace every section's headers and footers with the firm's
 * canonical set:
 *
 *   first-page header  → MGA logo (centered)
 *   first-page footer  → firm contact / VAT info image
 *   primary header     → empty
 *   primary footer     → "Sida X | Y" (live page-number fields)
 *   even-page header   → empty
 *   even-page footer   → "Sida X | Y" (live page-number fields)
 *
 * Runs unconditionally before the tag-driven processors. Idempotent:
 * running twice on the same doc leaves it in the same state.
 *
 * Implementation notes:
 *  - `getHeader(firstPage)` / `getFooter(firstPage)` auto-enable the
 *    "different first page" section flag; no separate toggle needed.
 *  - Page numbers are inserted via `insertField(..., FieldType.page,
 *    ..., FieldType.numPages, ...)` so they remain live, not snapshot
 *    text. Requires WordApi 1.5+.
 *  - Image content goes through `insertHtml` with inline base64 data
 *    URIs to avoid a runtime fetch + the related CORS / dev-vs-prod
 *    URL juggling.
 */
export async function normalizeHeadersAndFooters(document: Word.Document): Promise<void> {
  const sections = document.sections;
  sections.load('items');
  await document.context.sync();

  for (const section of sections.items) {
    setHtmlBody(section.getHeader(Word.HeaderFooterType.firstPage), FIRST_PAGE_HEADER_HTML);
    setHtmlBody(section.getFooter(Word.HeaderFooterType.firstPage), FIRST_PAGE_FOOTER_HTML);
    section.getHeader(Word.HeaderFooterType.primary).clear();
    section.getHeader(Word.HeaderFooterType.evenPages).clear();
    setPageNumberFooter(section.getFooter(Word.HeaderFooterType.primary));
    setPageNumberFooter(section.getFooter(Word.HeaderFooterType.evenPages));
  }

  await document.context.sync();
}

function setHtmlBody(body: Word.Body, html: string): void {
  body.clear();
  body.insertHtml(html, Word.InsertLocation.replace);
}

function setPageNumberFooter(body: Word.Body): void {
  body.clear();
  // "Sida {PAGE} | {NUMPAGES}" with live fields, centered.
  const sida = body.insertText('Sida ', Word.InsertLocation.start);
  // Word.Range exposes the containing paragraph via the
  // `paragraphs.getFirst()` proxy — there's no `parentParagraph` on
  // Word.Range itself.
  sida.paragraphs.getFirst().alignment = Word.Alignment.centered;
  const pageField = sida.insertField(Word.InsertLocation.after, Word.FieldType.page);
  const sep = pageField.result.insertText(' | ', Word.InsertLocation.after);
  sep.insertField(Word.InsertLocation.after, Word.FieldType.numPages);
}
