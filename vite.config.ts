import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

const DEV_PORT = 3000;

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
export default defineConfig(({ command }) => ({
  base: './',
  plugins: command === 'serve' ? [react(), basicSsl()] : [react()],
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
}));
