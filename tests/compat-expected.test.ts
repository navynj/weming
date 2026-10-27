import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The migration compatibility check's judge (scripts/compat-expected.mjs):
 * production's database tests may fail only where a pending migration lists
 * them, by full name, as broken on purpose.
 */
const SCRIPT = join(__dirname, '..', 'scripts', 'compat-expected.mjs');
const RANGES = 'a pool layout > refuses values outside the ranges';
let dirs: string[] = [];

type Test = { ancestorTitles: string[]; title: string; status: 'passed' | 'failed' };
const test = (name: string, status: Test['status']): Test => {
  const parts = name.split(' > ');
  return { ancestorTitles: parts.slice(0, -1), title: parts.at(-1)!, status };
};

/** Runs the judge on these results, a live migrations folder and the PR's (live plus `pending`). */
function judge(
  tests: Test[],
  pending: Record<string, string>,
  { fileFailed = false, applied = '-- applied\nselect 1;\n' } = {},
): { code: number; out: string } {
  const root = mkdtempSync(join(tmpdir(), 'compat-'));
  dirs.push(root);
  const live = join(root, 'live');
  const pr = join(root, 'pr');
  mkdirSync(live);
  mkdirSync(pr);
  for (const dir of [live, pr]) writeFileSync(join(dir, '0049_old.sql'), applied);
  for (const [file, text] of Object.entries(pending)) writeFileSync(join(pr, file), text);
  const results = join(root, 'results.json');
  writeFileSync(
    results,
    JSON.stringify({
      testResults: [
        {
          name: 'tests/x-db.test.ts',
          status: fileFailed || tests.some((t) => t.status === 'failed') ? 'failed' : 'passed',
          message: fileFailed ? 'Cannot find module' : '',
          assertionResults: tests,
        },
      ],
    }),
  );
  try {
    const out = execFileSync('node', [SCRIPT, results, pr, live], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status: number; stdout: string };
    return { code: e.status, out: e.stdout };
  }
}

const BLOCK = (name: string): string =>
  `-- 0050: wider.\n--\n-- compat-expected-failures:\n--   "${name}": widens label.width on purpose\n\nselect 1;\n`;

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

describe('the compatibility check’s expected failures', () => {
  it('passes when every failure is listed by a pending migration, and prints what was knowingly broken', () => {
    const { code, out } = judge([test(RANGES, 'failed'), test('a > b', 'passed')], {
      '0050_wider.sql': BLOCK(RANGES),
    });
    expect(code).toBe(0);
    expect(out).toContain(`✓ "${RANGES}" (0050_wider.sql): widens label.width on purpose`);
  });

  it('passes with nothing listed and nothing failing', () => {
    expect(judge([test('a > b', 'passed')], { '0050_x.sql': 'select 1;\n' }).code).toBe(0);
  });

  it('fails on a failure no migration lists', () => {
    const { code, out } = judge([test(RANGES, 'failed'), test('a > other', 'failed')], {
      '0050_wider.sql': BLOCK(RANGES),
    });
    expect(code).toBe(1);
    expect(out).toContain('failed and not listed: "a > other"');
  });

  it('fails when a listed test passes, so a stale entry is cleaned up', () => {
    const { code, out } = judge([test(RANGES, 'passed')], { '0050_wider.sql': BLOCK(RANGES) });
    expect(code).toBe(1);
    expect(out).toContain('but passed');
  });

  it('fails when a listed test does not exist: names match exactly', () => {
    const { code, out } = judge([test(RANGES, 'failed')], {
      '0050_wider.sql': BLOCK('a pool layout > refuses values'),
    });
    expect(code).toBe(1);
    expect(out).toContain('no such test');
    expect(out).toContain(`failed and not listed: "${RANGES}"`);
  });

  it('reads only pending migrations: a block in one production already has excuses nothing', () => {
    const { code, out } = judge([test(RANGES, 'failed')], {}, { applied: BLOCK(RANGES) });
    expect(code).toBe(1);
    expect(out).toContain(`failed and not listed: "${RANGES}"`);
  });

  it('fails when a test file did not run at all', () => {
    const { code, out } = judge([], { '0050_wider.sql': 'select 1;\n' }, { fileFailed: true });
    expect(code).toBe(1);
    expect(out).toContain('did not run');
  });
});
