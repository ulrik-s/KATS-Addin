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
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { platform, tmpdir } from 'node:os';
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
// opentelemetry deps that conflict with Yarn PnP. We need three guards
// against the PnP loader leaking into the npx child:
//   1. Clear NODE_OPTIONS so node doesn't auto-load .pnp.cjs.
//   2. Clear YARN_* so yarn-hooks don't reinstate PnP.
//   3. cwd into a clean tmp dir (with a stub package.json — the tool
//      reads cwd's package.json) so the child can't even discover
//      .pnp.cjs by walking up from the project root.
const childEnv = { ...process.env };
delete childEnv.NODE_OPTIONS;
delete childEnv.YARN_NODE_LINKER;
delete childEnv.YARN_PNP_DATA_PATH;

const workDir = mkdtempSync(resolve(tmpdir(), 'kats-sideload-'));
writeFileSync(
  resolve(workDir, 'package.json'),
  JSON.stringify({ name: 'kats-sideload-helper', version: '1.0.0', private: true }, null, 2),
  'utf8',
);

const child = spawn('npx', args, {
  cwd: workDir,
  env: childEnv,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
