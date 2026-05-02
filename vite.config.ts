import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

const DEV_PORT = 3000;

/**
 * Run a shell command, return its stdout trimmed, or `fallback` if the
 * command fails (e.g. git not installed, not a working tree, detached
 * state). Used at build/serve time to stamp git provenance into the
 * bundle so the task pane can display dev-vs-prod / branch / commit
 * — sideloaded dev builds and admin-deployed prod builds both show up
 * as KATS menus in Word and need to be tellable apart.
 */
function safeShell(cmd: string, fallback: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

/**
 * Vite config for the KATS Word Add-in.
 *
 * Builds two HTML entries — the task pane and the (hidden) ribbon
 * commands page — both of which Word loads from the hosted bundle on
 * GitHub Pages. Office.js itself is NOT bundled; it is loaded from the
 * Microsoft CDN via a <script> tag in each HTML file.
 *
 * For dev (`yarn start`), `@vitejs/plugin-basic-ssl` auto-generates a
 * self-signed cert so the dev server can run on `https://localhost:3000`.
 * Word requires HTTPS for sideloaded add-ins; the cert prompt is a
 * one-time accept in the browser/Word the first time you sideload.
 *
 * The bundle is published at the repo's GitHub Pages URL, so all asset
 * paths must be RELATIVE (`base: './'`). Otherwise Word would fetch
 * `/assets/foo.js` against its own host instead of GitHub Pages.
 */
export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  return {
    base: './',
    plugins: isDev ? [react(), basicSsl()] : [react()],
    define: {
      __KATS_GIT_DESCRIBE__: JSON.stringify(
        safeShell('git describe --always --dirty --broken', 'unknown'),
      ),
      __KATS_GIT_BRANCH__: JSON.stringify(safeShell('git rev-parse --abbrev-ref HEAD', 'unknown')),
      __KATS_BUILD_KIND__: JSON.stringify(isDev ? 'dev' : 'prod'),
    },
    server: {
      port: DEV_PORT,
      strictPort: true,
      host: 'localhost',
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: {
          taskpane: resolve(here, 'taskpane.html'),
          commands: resolve(here, 'commands.html'),
        },
      },
    },
  };
});
