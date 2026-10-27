import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

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
  env: {
    ...(siteUrl ? { NEXT_PUBLIC_SITE_URL: siteUrl } : {}),
    // Error tracking (lib/observability.ts): which deployment, which commit.
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.VERCEL_ENV ?? 'development',
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA ?? '',
  },
  // The push service worker (H32): never cached, so an update reaches every
  // browser on its next check; it may load nothing but itself.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

// Source maps go to Sentry from the build that made the bundle (Vercel's),
// with SENTRY_AUTH_TOKEN from its Production env — never the repo — and are
// deleted after upload, so they are never served. A build with no token
// (a preview, a local run) uploads nothing.
export default withSentryConfig(nextConfig, {
  org: 'whaleblue-studio',
  project: 'weming',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: { name: process.env.VERCEL_GIT_COMMIT_SHA },
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
  widenClientFileUpload: true,
  telemetry: false,
  silent: !process.env.SENTRY_AUTH_TOKEN,
});
