import { defineConfig } from '@playwright/test';

/** The specs that measure a production build. */
const PROD = /(place-switch|one-write|fast-switch)\.spec\.ts/;
const PROD_URL = 'http://127.0.0.1:3200';

/**
 * Measurements in a real browser (review): direct manipulation on the
 * board, read every frame in Chrome — the one installed, nothing
 * downloaded — on the /dev/board fixture, which reads and writes no data;
 * and switching places on a production build, as a throwaway person of its
 * own. Runs in the push gate (.githooks/pre-push) beside the database tests.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    channel: 'chrome',
  },
  projects: [
    { name: 'phone', testIgnore: PROD, use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop', testIgnore: PROD, use: { viewport: { width: 1280, height: 900 } } },
    // Prefetching and the router's cache exist only in a production build
    // (review: switching places), so those measurements get one of their own.
    {
      name: 'prod',
      testMatch: PROD,
      use: { baseURL: PROD_URL, viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://127.0.0.1:3000/dev/board',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Never reused: a server already on the port could be an older build.
      command: `NEXT_PUBLIC_SITE_URL=${PROD_URL} pnpm build && pnpm start -H 127.0.0.1 -p 3200`,
      url: `${PROD_URL}/sign-in`,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
