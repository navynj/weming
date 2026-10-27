#!/usr/bin/env node
// Judges the migration compatibility check (.github/workflows/migrations-compat.yml):
// production's database tests, run against a database with the pending
// migrations applied, may fail only where a pending migration says, by name,
// that it breaks them on purpose.
//
//   node scripts/compat-expected.mjs <vitest-results.json> <pr-migrations-dir> <live-migrations-dir>
//
// A pending migration is one in the pull request's supabase/migrations that
// production's commit does not have. Its header may carry:
//
//   -- compat-expected-failures:
//   --   "a pool layout > refuses values outside the ranges, …": 0050 widens label.width to 4 on purpose
//
// one line per test: its full name in quotes (describe titles and the test's
// own, joined by " > ", exactly as vitest names them), a colon, and why.
// Only for an intended change to validation or limits — never to wave an app
// incompatibility through (_docs/DEPLOY.md, Migrations).
//
// Passes when every failing test is listed. Fails on any unlisted failure, a
// test file that fails without a test failing (it did not load), and a listed
// test that passed or no longer exists, so a stale entry is cleaned up.
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const HEADER = /^--\s*compat-expected-failures:\s*$/;
const ENTRY = /^--\s+"((?:[^"\\]|\\.)+)"\s*:\s*(\S.*)$/;

/** The expectations a migration's text declares, in order: { name, reason }. */
export function expectationsIn(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!HEADER.test(lines[i].trim())) continue;
    for (i += 1; i < lines.length; i += 1) {
      const m = ENTRY.exec(lines[i].trim());
      if (!m) break;
      out.push({ name: m[1].replace(/\\(.)/g, '$1'), reason: m[2].trim() });
    }
  }
  return out;
}

/** Every pending migration's expectations, each with the file that declared it. */
export function pendingExpectations(prDir, liveDir) {
  const live = new Set(readdirSync(liveDir).filter((f) => f.endsWith('.sql')));
  return readdirSync(prDir)
    .filter((f) => f.endsWith('.sql') && !live.has(f))
    .sort()
    .flatMap((file) =>
      expectationsIn(readFileSync(join(prDir, file), 'utf8')).map((e) => ({ ...e, file })),
    );
}

/** A vitest test's full name: its describe titles and its own, joined by " > ". */
export function fullName(test) {
  return [...(test.ancestorTitles ?? []), test.title].join(' > ');
}

/** The verdict on vitest's JSON results against the expectations. */
export function judge(results, expected) {
  const failed = new Set();
  const passed = new Set();
  const broken = [];
  for (const file of results.testResults ?? []) {
    const tests = file.assertionResults ?? [];
    for (const test of tests) {
      if (test.status === 'failed') failed.add(fullName(test));
      else if (test.status === 'passed') passed.add(fullName(test));
    }
    // A file that failed with no test failing never ran: nothing can excuse that.
    if (file.status === 'failed' && !tests.some((t) => t.status === 'failed'))
      broken.push(`${file.name}: ${(file.message ?? 'failed to run').split('\n')[0]}`);
  }
  const listed = new Map(expected.map((e) => [e.name, e]));
  const matched = expected.filter((e) => failed.has(e.name));
  const unlisted = [...failed].filter((name) => !listed.has(name));
  const stillPassing = expected.filter((e) => passed.has(e.name));
  const missing = expected.filter((e) => !failed.has(e.name) && !passed.has(e.name));
  return {
    ok: unlisted.length === 0 && broken.length === 0 && stillPassing.length + missing.length === 0,
    matched,
    unlisted,
    broken,
    stillPassing,
    missing,
  };
}

function report(v) {
  const lines = [];
  if (v.matched.length > 0) {
    lines.push('Knowingly broken by the pending migrations (compat-expected-failures):');
    for (const e of v.matched) lines.push(`  ✓ "${e.name}" (${e.file}): ${e.reason}`);
  }
  for (const name of v.unlisted) lines.push(`  ✖ failed and not listed: "${name}"`);
  for (const b of v.broken) lines.push(`  ✖ did not run: ${b}`);
  for (const e of v.stillPassing)
    lines.push(`  ✖ listed in ${e.file} but passed: "${e.name}" (remove the entry)`);
  for (const e of v.missing)
    lines.push(`  ✖ listed in ${e.file} but no such test: "${e.name}" (remove or fix the entry)`);
  return lines;
}

function main() {
  const [resultsPath, prDir, liveDir] = process.argv.slice(2);
  if (!resultsPath || !prDir || !liveDir) {
    console.error(
      'usage: compat-expected.mjs <vitest-results.json> <pr-migrations-dir> <live-migrations-dir>',
    );
    process.exit(2);
  }
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  const verdict = judge(results, pendingExpectations(prDir, liveDir));
  const lines = report(verdict);
  for (const line of lines) console.log(line);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(
      summary,
      ['### Migration compatibility', '', ...lines.map((l) => `- ${l.trim()}`), ''].join('\n') +
        '\n',
    );
  }
  if (verdict.ok) {
    console.log(
      verdict.matched.length > 0
        ? '✓ Production still works with these migrations, but for the tests they change on purpose.'
        : '✓ The app in production still works with these migrations.',
    );
  } else {
    console.log(
      '::error::This migration breaks the running app; split it into expand and contract — or, for an intended change to validation or limits, list the test in the migration’s compat-expected-failures block.',
    );
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
