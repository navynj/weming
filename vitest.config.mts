import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

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

/**
 * The files that talk to the local Postgres. They prove RLS, the triggers and
 * the RPCs actually hold, so they run before every push (the pre-push hook);
 * a build machine has no stack to point them at, so CI runs the rest.
 */
export const NEEDS_LOCAL_STACK = [
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
  'tests/joint-together-db.test.ts',
];

/**
 * A node test that mocks a module or rewrites process.env needs its own
 * module graph; without isolation the mock would leak into the next file.
 * Found by reading the files, so a new one cannot be missed.
 */
const MUTATES = /\bvi\.(mock|doMock|stubGlobal|stubEnv)\(|process\.env\.\w+\s*(\?\?)?=[^=]/;
const nodeUnit = readdirSync('tests')
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => `tests/${f}`)
  .filter((f) => !NEEDS_LOCAL_STACK.includes(f));
const SIDE_EFFECTS = nodeUnit.filter((f) => MUTATES.test(readFileSync(f, 'utf8')));

const shared = {
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
};

/**
 * Four projects by what a file needs (review: the gate took minutes, mostly
 * starting jsdom for files that never touch a DOM, one file at a time):
 *   unit      node, pure functions: one shared module graph, no isolation;
 *   unit-iso  node, files that mock modules or env: isolated;
 *   dom       jsdom, every .tsx (each a render): isolated, in parallel;
 *   db        node, the local stack: one file at a time, they share it.
 * `pnpm test` runs all four; CI and the commit hook run every one but db.
 */
export default defineConfig({
  ...shared,
  test: {
    setupFiles: ['tests/setup.ts'],
    projects: [
      {
        ...shared,
        test: {
          name: 'unit',
          environment: 'node',
          include: nodeUnit.filter((f) => !SIDE_EFFECTS.includes(f)),
          setupFiles: ['tests/setup.ts'],
          isolate: false,
        },
      },
      {
        ...shared,
        test: {
          name: 'unit-iso',
          environment: 'node',
          include: SIDE_EFFECTS,
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        ...shared,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        ...shared,
        test: {
          name: 'db',
          environment: 'node',
          include: NEEDS_LOCAL_STACK,
          setupFiles: ['tests/setup.ts'],
          // The suites share the local stack; keep them serial and patient.
          fileParallelism: false,
        },
      },
    ],
  },
});
