import { fileURLToPath } from 'node:url';
import { defaultExclude, defineConfig } from 'vitest/config';

/**
 * The suite as a deploy can run it: everything except the files that talk to
 * a live Postgres.
 *
 * Those are not skipped for being slow — they are the ones that prove RLS,
 * the exclusion constraint and the containment triggers actually hold, and
 * they have to keep running locally before every push. A build machine has no
 * stack to point them at, so it runs the rest rather than pretending.
 */
/**
 * React ships two builds, and `act` exists only in the development one. A
 * deploy sets NODE_ENV=production for the whole build, vitest respects an
 * NODE_ENV that is already set, and the suite then resolves
 * `react-dom-test-utils.production.js` — where every render fails with
 * "React.act is not a function".
 *
 * Set here rather than in the script so no way of invoking the suite can miss
 * it. Tests are a development-time activity whatever the surrounding build is
 * doing; a suite run against production React is testing a different program.
 */
// Assigned through Object.assign because Next types NODE_ENV as read-only,
// and these configs are inside the project's type check.
Object.assign(process.env, { NODE_ENV: 'test' });

const NEEDS_LOCAL_STACK = [
  'tests/rls.test.ts',
  'tests/edit-delete.test.ts',
  'tests/timeline-exclusivity.test.ts',
  'tests/break.test.ts',
  'tests/bootstrap-profile.test.ts',
  'tests/auth-redirect.test.ts',
  'tests/splash-crud.test.ts',
  'tests/date-only-span.test.ts',
  'tests/sessions.test.ts',
  'tests/pools-rls.test.ts',
  'tests/written-on-db.test.ts',
  'tests/pool-delete.test.ts',
  'tests/joint-ripple-lane.test.ts',
  'tests/avatars-db.test.ts',
  'tests/splash-edit-db.test.ts',
  'tests/conversions-db.test.ts',
  'tests/pool-photo-db.test.ts',
  'tests/board-layouts-db.test.ts',
  'tests/ripple-responses-db.test.ts',
  'tests/dated-ripples-db.test.ts',
  'tests/per-pool-invitees-db.test.ts',
  'tests/left-pool-ripples-db.test.ts',
];

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: [...defaultExclude, ...NEEDS_LOCAL_STACK],
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
  },
});
