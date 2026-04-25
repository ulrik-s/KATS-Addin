import { FIRMINFO_DATA_URL, LOGO_DATA_URL } from './canonical-images.generated.js';

/**
 * Canonical first-page header — the firm logo, centered.
 *
 * Word's `insertHtml` ignores CSS `pt` units; HTML pixel attributes
 * are reliable. Original OOXML had cx=2543175 EMU × cy=1190625 EMU
 * → 200pt × 94pt → ~267px × 125px at 96 DPI.
 *
 * Tight, no whitespace inside <p> — Word turns inline whitespace
 * into text nodes that show up as gaps.
 */
export const FIRST_PAGE_HEADER_HTML =
  `<p style="text-align:center;margin:0;">` +
  `<img src="${LOGO_DATA_URL}" alt="MGA-logo" width="267" height="125" />` +
  `</p>`;

/**
 * Canonical first-page footer — horizontal divider above a 2-cell
 * table: small "samfundet" (Swedish Bar Association) badge at the
 * left, firm contact text vertically centered to its right.
 *
 * Original OOXML for the badge was cx=400050 × cy=571500 EMU → 31pt
 * × 45pt → ~42px × 60px. The badge is a credentials stamp; placing
 * it inline with the text reads better than the previous "below"
 * stack.
 *
 * Cambria 9pt matches the source styling.
 */
export const FIRST_PAGE_FOOTER_HTML = [
  `<hr style="border:none;border-top:1pt solid #000;margin:0 0 4pt 0;" />`,
  // border="0" + border-collapse + per-cell border:none — Word otherwise
  // draws default table gridlines even when style:none is set on <table>.
  `<table border="0" cellspacing="0" cellpadding="0"`,
  ` style="width:100%;border:none;border-collapse:collapse;margin:0;">`,
  `<tr>`,
  `<td width="42" style="border:none;vertical-align:middle;padding:0;">`,
  `<img src="${FIRMINFO_DATA_URL}" alt="Sveriges Advokatsamfund" width="42" height="60" />`,
  `</td>`,
  `<td style="border:none;vertical-align:middle;padding:0 0 0 8pt;">`,
  `<p style="margin:0;font-family:Cambria,serif;font-size:9pt;">`,
  `Moll &amp; Grosskopf Advokater AB`,
  `</p>`,
  `<p style="margin:0;font-family:Cambria,serif;font-size:9pt;">`,
  `Tel: +46(0)46-20 01 51 &nbsp;∽&nbsp; www.mgadvokater.se &nbsp;∽&nbsp; info@mgadvokater.se`,
  `</p>`,
  `<p style="margin:0;font-family:Cambria,serif;font-size:9pt;">`,
  `Arvoden bankgiro 899-9344 &nbsp;∽&nbsp; VAT nr: SE559124788601 &nbsp;∽&nbsp; Godkänd för F-skatt`,
  `</p>`,
  `</td>`,
  `</tr>`,
  `</table>`,
].join('');
