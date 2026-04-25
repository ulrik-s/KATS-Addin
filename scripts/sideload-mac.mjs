#!/usr/bin/env node
// @ts-check
/**
 * Sideload the dev manifest into Word for Mac.
 *
 * Mac Word does not expose an "Upload My Add-in" dialog like Windows
 * Word does — sideloading is done by dropping the manifest into the
 * `wef` folder under the Word container, which Word scans on launch.
 *
 * After running this script, RESTART Word. The MGA tab appears in the
 * ribbon, populated from the running `yarn start` dev server.
 *
 * Reference: https://learn.microsoft.com/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..');

if (platform() !== 'darwin') {
  console.error(
    'sideload-mac.mjs only runs on macOS. On Windows, use the Insert → My Add-ins → Upload My Add-in dialog.',
  );
  process.exit(1);
}

const manifestPath = resolve(root, 'manifest/manifest.dev.xml');
if (!existsSync(manifestPath)) {
  console.error(
    `Dev manifest not found: ${manifestPath}\nRun \`yarn build:manifest:dev\` (or just \`yarn start\`) first.`,
  );
  process.exit(1);
}

const guidPath = resolve(root, 'manifest/guid.txt');
const guid = readFileSync(guidPath, 'utf8').trim();

const wefDir = resolve(homedir(), 'Library/Containers/com.microsoft.Word/Data/Documents/wef');
mkdirSync(wefDir, { recursive: true });

// Mac Word identifies sideloaded manifests by the GUID in the
// filename — using the manifest's own Id keeps multiple add-ins
// from clashing.
const targetPath = resolve(wefDir, `${guid}.manifest.xml`);
copyFileSync(manifestPath, targetPath);

console.log(
  [
    `KATS-tillägget sideloaded.`,
    `  Källa: ${manifestPath}`,
    `  Mål:   ${targetPath}`,
    ``,
    `Nästa steg:`,
    `  1. Stäng alla Word-fönster (helst hela Word-appen).`,
    `  2. Starta om Word.`,
    `  3. Öppna ett dokument — KATS-fliken syns i ribbon.`,
    `     (Om den inte syns: Insert → Add-ins → My Add-ins och välj KATS där.)`,
    ``,
    `Vid första klicket: acceptera HTTPS-certifikatet för https://localhost:3000.`,
    `Vid kodändringar: Vite hot-reloadar automatiskt — ingen ny sideload behövs.`,
    ``,
    `För att ta bort tillägget igen:`,
    `  rm "${targetPath}"`,
  ].join('\n'),
);
