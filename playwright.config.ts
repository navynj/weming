import { defineConfig } from '@playwright/test';

/**
 * Measurements in a real browser (review): direct manipulation on the
 * board, read every frame in Chrome — the one installed, nothing
 * downloaded — on the /dev/board fixture, which reads and writes no data.
 * Runs in the push gate (.githooks/pre-push) beside the database tests.
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
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:3000/dev/board',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
