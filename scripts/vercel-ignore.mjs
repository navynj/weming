#!/usr/bin/env node
// Vercel's Ignored Build Step (vercel.json ignoreCommand): a production build
// goes ahead only when this commit's CI run (.github/workflows/ci.yml)
// passed. Exit 1 builds; exit 0 skips (Vercel marks the deployment
// CANCELED and production stays on the last good deploy).
//
// Previews build as before. A production build waits for the CI run to
// finish — it starts on the same push — and skips if it failed, was
// cancelled, or never reported within the wait: unverified code does not
// reach production. Reads GitHub's API for the public repo; GITHUB_TOKEN in
// Vercel's env, if set, lifts the anonymous rate limit.
const WAIT_MS = Number(process.env.CI_WAIT_MS ?? 12 * 60 * 1000);
const EVERY_MS = Number(process.env.CI_POLL_MS ?? 15 * 1000);

const env = process.env;
if (env.VERCEL_ENV !== 'production') {
  console.log(`→ ${env.VERCEL_ENV ?? 'local'} build: not gated on CI.`);
  process.exit(1);
}
const sha = env.VERCEL_GIT_COMMIT_SHA;
const repo = `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`;
if (!sha || repo.includes('undefined')) {
  console.log('✖ No commit or repository from Vercel: skipping the production build.');
  process.exit(0);
}

const url = `https://api.github.com/repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=1`;
const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'weming-vercel-ignore',
  ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
};

const started = Date.now();
let told = false;
while (Date.now() - started < WAIT_MS) {
  try {
    const response = await fetch(url, { headers });
    // Once, which credential this run reads GitHub with — never the token
    // itself: GitHub's limit is 5000 an hour for a token, 60 without.
    if (!told) {
      told = true;
      console.log(
        `→ GitHub API ${env.GITHUB_TOKEN ? 'with GITHUB_TOKEN' : 'anonymous'}: rate limit ${response.headers.get('x-ratelimit-limit') ?? '?'} an hour.`,
      );
    }
    if (response.status === 401) {
      console.log(
        '✖ GitHub refused GITHUB_TOKEN (401): production build skipped. Replace the token in Vercel.',
      );
      process.exit(0);
    }
    if (response.ok) {
      const run = (await response.json()).workflow_runs?.[0];
      if (run?.status === 'completed') {
        if (run.conclusion === 'success') {
          console.log(`✓ CI passed for ${sha.slice(0, 7)} (${run.html_url}): building.`);
          process.exit(1);
        }
        console.log(
          `✖ CI ${run.conclusion} for ${sha.slice(0, 7)} (${run.html_url}): production build skipped.`,
        );
        process.exit(0);
      }
      console.log(`… CI ${run ? run.status : 'not started'} for ${sha.slice(0, 7)}; waiting.`);
    } else {
      console.log(`… GitHub answered ${response.status}; waiting.`);
    }
  } catch (error) {
    console.log(
      `… GitHub unreachable (${error instanceof Error ? error.message : error}); waiting.`,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, EVERY_MS));
}
console.log(`✖ No CI result for ${sha.slice(0, 7)} within the wait: production build skipped.`);
process.exit(0);
