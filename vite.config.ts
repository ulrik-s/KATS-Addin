import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * Vite config for the KATS Word Add-in.
 *
 * Builds two HTML entries — the task pane and the (hidden) ribbon
 * commands page — both of which Word loads from the hosted bundle on
 * GitHub Pages. Office.js itself is NOT bundled; it is loaded from the
 * Microsoft CDN via a <script> tag in each HTML file.
 *
 * The bundle is published at the repo's GitHub Pages URL, so all asset
 * paths must be RELATIVE (`base: './'`). Otherwise Word would fetch
 * `/assets/foo.js` against its own host instead of GitHub Pages.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
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
});
