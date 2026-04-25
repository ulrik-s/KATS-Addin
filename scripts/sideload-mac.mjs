#!/usr/bin/env node
// @ts-check
/**
 * Sideload the dev manifest into Word on macOS via Microsoft's
 * official `office-addin-debugging` tool.
 *
 * Wraps `office-addin-debugging start ... --no-debug --no-live-reload`
 * so we get just the sideload step (without the tool also trying to
 * spawn its own dev server — `yarn start` runs Vite separately).
 *
 * Why use this instead of dropping the manifest into
 * `Documents/wef/`: recent Office for Mac builds changed the
 * sideload path, and the dev-tool knows the right destination per
 * version. The legacy wef-folder approach silently stops working on
 * newer M365 installs.
 *
 * Reference: https://learn.microsoft.com/javascript/api/overview/office-addin-debugging
 */
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
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

console.log(
  [
    `Sideloadar via office-addin-debugging…`,
    `  Manifest: ${manifestPath}`,
    ``,
    `Verktyget öppnar Word automatiskt och registrerar tillägget.`,
    `Om Word redan är öppet stängs det ner först.`,
    ``,
    `Förutsätter att \`yarn start\` redan kör i ett annat fönster`,
    `(Vite på https://localhost:3000).`,
    ``,
  ].join('\n'),
);

const args = [
  '--yes',
  'office-addin-debugging',
  'start',
  manifestPath,
  'desktop',
  '--app',
  'word',
  '--debug-method',
  'web',
  '--no-debug',
  '--no-live-reload',
];

// `npx` instead of yarn's bin because office-addin-debugging pulls in
// opentelemetry deps that conflict with Yarn PnP. npx isolates them.
const child = spawn('npx', args, {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
