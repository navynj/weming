import type { NextConfig } from 'next';

import { resolveSiteUrl } from './lib/site';

// The deployment's origin (lib/site.ts): set, or a preview's own branch URL.
// Production must set it: a build without one fails here rather than
// shipping redirects built from nothing.
const siteUrl = resolveSiteUrl(process.env);
if (process.env.VERCEL_ENV === 'production' && !process.env.NEXT_PUBLIC_SITE_URL) {
  throw new Error('NEXT_PUBLIC_SITE_URL is not set: production needs its origin.');
}

const nextConfig: NextConfig = {
  // Dev serves on 127.0.0.1 (see the `dev` script) because that is the
  // canonical origin OAuth redirects are built from. Both spellings are
  // allowed so a stray localhost visit still hydrates instead of rendering a
  // page whose buttons silently do nothing.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Baked into the build, for the browser and the server alike: a preview's
  // branch URL is known only to the build.
  env: siteUrl ? { NEXT_PUBLIC_SITE_URL: siteUrl } : {},
};

export default nextConfig;
