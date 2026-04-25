import { FIRMINFO_DATA_URL, LOGO_DATA_URL } from './canonical-images.generated.js';

/**
 * Canonical first-page header — the firm logo, centered.
 *
 * Sizing matches the source OOXML: cx=2543175 EMU = 200pt wide,
 * cy=1190625 EMU ≈ 94pt tall.
 */
export const FIRST_PAGE_HEADER_HTML = `
  <p style="text-align:center; margin:0;">
    <img src="${LOGO_DATA_URL}" alt="MGA-logo"
         style="width:200pt; height:94pt;" />
  </p>
`;

/**
 * Canonical first-page footer — firm contact + business info image.
 * The text content mirrors what was in the source doc; the image
 * carries any additional layout that doesn't translate cleanly to
 * inline CSS.
 */
export const FIRST_PAGE_FOOTER_HTML = `
  <p style="text-align:center; margin:0;">
    <img src="${FIRMINFO_DATA_URL}" alt=""
         style="width:480pt; height:auto;" />
  </p>
`;
