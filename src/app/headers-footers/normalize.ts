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

  const firstPageFooters: Word.Body[] = [];
  for (const section of sections.items) {
    setHtmlBody(section.getHeader(Word.HeaderFooterType.firstPage), FIRST_PAGE_HEADER_HTML);
    const firstFooter = section.getFooter(Word.HeaderFooterType.firstPage);
    setHtmlBody(firstFooter, FIRST_PAGE_FOOTER_HTML);
    firstPageFooters.push(firstFooter);
    section.getHeader(Word.HeaderFooterType.primary).clear();
    section.getHeader(Word.HeaderFooterType.evenPages).clear();
    setPageNumberFooter(section.getFooter(Word.HeaderFooterType.primary));
    setPageNumberFooter(section.getFooter(Word.HeaderFooterType.evenPages));
  }

  await document.context.sync();

  // Belt-and-suspenders: programmatically strip borders from any
  // table Word inserted into a first-page footer. CSS `border:none`
  // and `border="0"` aren't always honoured by Word's HTML import —
  // it sometimes draws default 0.5pt black gridlines anyway.
  await stripFooterTableBorders(firstPageFooters);
}

function setHtmlBody(body: Word.Body, html: string): void {
  // `replace` substitutes the entire existing body content. Doing
  // an explicit `clear()` first then `replace` can leave a trailing
  // empty paragraph (Word counts the post-clear empty-paragraph as
  // existing content) which then ends up as an extra blank line.
  body.insertHtml(html, Word.InsertLocation.replace);
}

/** Set every border location on every table inside `bodies` to `none`. */
async function stripFooterTableBorders(bodies: readonly Word.Body[]): Promise<void> {
  if (bodies.length === 0) return;
  const ctx = bodies[0]?.context;
  if (!ctx) return;

  const allTables: Word.TableCollection[] = [];
  for (const body of bodies) {
    const tables = body.tables;
    tables.load('items');
    allTables.push(tables);
  }
  await ctx.sync();

  const BORDER_LOCATIONS: Word.BorderLocation[] = [
    Word.BorderLocation.top,
    Word.BorderLocation.bottom,
    Word.BorderLocation.left,
    Word.BorderLocation.right,
    Word.BorderLocation.insideHorizontal,
    Word.BorderLocation.insideVertical,
  ];

  for (const tables of allTables) {
    for (const table of tables.items) {
      for (const loc of BORDER_LOCATIONS) {
        table.getBorder(loc).type = Word.BorderType.none;
      }
    }
  }
  await ctx.sync();
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
