import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

// Chrome MV3 extension build. @crxjs/vite-plugin reads the manifest, bundles the
// content script + service worker correctly for the extension runtime, and wires
// HMR in dev. Load the unpacked build from `dist/` at chrome://extensions.
export default defineConfig({
  // Load VITE_* env from the repo-root .env (shared across the monorepo).
  envDir: '../..',
  plugins: [react(), crx({ manifest })],
  server: { port: 5173, strictPort: true },
});
