import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Tessera keeps a single .env at the monorepo root (shared with the extension's
// Vite build — see apps/extension/vite.config.ts `envDir`). Next only auto-loads
// .env from the app directory, so pull the root file into process.env here, before
// Next inlines NEXT_PUBLIC_* into the client bundle. dotenv won't clobber vars
// already set in the real environment (e.g. on Vercel), so hosted deploys win.
const appDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(appDir, '../../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint is owned by the monorepo-root flat ESLint config (`npm run lint`), not
  // by `next build`. Keep type-checking on.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
