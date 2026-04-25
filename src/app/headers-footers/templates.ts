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
 * Canonical first-page footer — horizontal divider, firm contact
 * lines, and the small "samfundet" (Swedish Bar Association) badge.
 *
 * Original OOXML for the badge was cx=400050 × cy=571500 EMU → 31pt
 * × 45pt → ~42px × 60px. Far smaller than a logo; it's a credentials
 * stamp at the bottom of the contact block.
 *
 * Text and divider together replace what was previously an
 * image-only footer that lost the firm contact info entirely.
 */
export const FIRST_PAGE_FOOTER_HTML = [
  `<hr style="border:none;border-top:1pt solid #000;margin:0 0 4pt 0;" />`,
  `<p style="text-align:center;font-family:Cambria,serif;font-size:9pt;margin:0;">`,
  `Moll &amp; Grosskopf Advokater AB`,
  `</p>`,
  `<p style="text-align:center;font-family:Cambria,serif;font-size:9pt;margin:0;">`,
  `Tel: +46(0)46-20 01 51 &nbsp;∽&nbsp; www.mgadvokater.se`,
  `</p>`,
  `<p style="text-align:center;font-family:Cambria,serif;font-size:9pt;margin:0;">`,
  `Arvoden bankgiro 899-9344 &nbsp;∽&nbsp; VAT nr: SE559124788601 &nbsp;∽&nbsp; Godkänd för F-skatt`,
  `</p>`,
  `<p style="text-align:center;margin:2pt 0 0 0;">`,
  `<img src="${FIRMINFO_DATA_URL}" alt="Sveriges Advokatsamfund" width="42" height="60" />`,
  `</p>`,
].join('');
