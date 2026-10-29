#!/usr/bin/env node
// Downloads every object in the app's buckets into <out>/<bucket>/<path>,
// paths preserved, and writes <out>/manifest.json with counts and bytes.
//
//   node scripts/backup-storage.mjs <out> [--previous <earlier storage dir>]
//
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment and
// prints neither. Prints totals only: object paths carry user ids, and in CI
// the log is public.
//
// With --previous, an object whose etag matches the earlier backup's manifest
// is hard-linked from there instead of downloaded, so weekly local runs stay
// small while every backup folder stays complete on its own.
//
// Any object that cannot be downloaded fails the run: a partial backup is
// never reported as done.
//
// Every bucket the app keeps (lib/storage/types.ts), through the storage
// adapter, so whichever backend holds the bytes, this reads them. Run with
// --no-warnings=MODULE_TYPELESS_PACKAGE_JSON: Node loads the adapter's
// TypeScript itself and says so once per file otherwise.
import { copyFile, link, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { createStorage, listAll } from '../lib/storage/backend.ts';
import { BUCKETS } from '../lib/storage/types.ts';

const PARALLEL = 4;

const args = process.argv.slice(2);
const out = args[0] ? resolve(args[0]) : null;
const at = args.indexOf('--previous');
const previous = at >= 0 && args[at + 1] ? resolve(args[at + 1]) : null;
if (!out) {
  console.error('usage: backup-storage.mjs <out> [--previous <dir>]');
  process.exit(2);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    '✖ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (values are never printed).',
  );
  process.exit(2);
}

const storage = createStorage({ supabaseUrl: url, serviceRoleKey: key });

/** The file an object lands in, never outside its bucket's folder. */
function target(root, bucket, path) {
  const base = resolve(root, bucket);
  const file = resolve(base, path);
  if (!file.startsWith(base + sep)) throw new Error('an object path escapes its bucket folder');
  return file;
}

async function earlier() {
  if (!previous) return new Map();
  try {
    const manifest = JSON.parse(await readFile(join(previous, 'manifest.json'), 'utf8'));
    return new Map(manifest.items.map((item) => [`${item.bucket}/${item.path}`, item]));
  } catch {
    return new Map(); // No earlier manifest: everything is downloaded.
  }
}

const before = await earlier();
const objects = [];
for (const bucket of BUCKETS) {
  for (const info of await listAll(storage, bucket)) objects.push({ bucket, info });
}

const items = [];
let failed = 0;
async function take({ bucket, info }) {
  const { path, etag, size, contentType } = info;
  const file = target(out, bucket, path);
  await mkdir(dirname(file), { recursive: true });
  const prior = before.get(`${bucket}/${path}`);
  let reused = false;
  if (prior && etag && prior.etag === etag) {
    const source = target(previous, bucket, path);
    try {
      await link(source, file);
      reused = true;
    } catch {
      try {
        await copyFile(source, file);
        reused = true;
      } catch {
        reused = false; // The earlier copy is gone: download it.
      }
    }
  }
  if (!reused) {
    try {
      await writeFile(file, await storage.get(bucket, path));
    } catch {
      failed += 1;
      return;
    }
  }
  items.push({ bucket, path, size, etag, contentType, reused });
}

for (let i = 0; i < objects.length; i += PARALLEL) {
  await Promise.all(objects.slice(i, i + PARALLEL).map(take));
}
if (failed > 0) {
  console.error(`✖ ${failed} object(s) could not be downloaded; this backup is incomplete.`);
  process.exit(1);
}

items.sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`));
const buckets = Object.fromEntries(
  BUCKETS.map((bucket) => {
    const mine = items.filter((item) => item.bucket === bucket);
    return [
      bucket,
      { objects: mine.length, bytes: mine.reduce((sum, item) => sum + item.size, 0) },
    ];
  }),
);
const manifest = {
  createdAt: new Date().toISOString(),
  objects: items.length,
  bytes: items.reduce((sum, item) => sum + item.size, 0),
  downloaded: items.filter((item) => !item.reused).length,
  reused: items.filter((item) => item.reused).length,
  buckets,
  items,
};
await mkdir(out, { recursive: true });
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const perBucket = BUCKETS.map((b) => `${b} ${buckets[b].objects}/${buckets[b].bytes}B`).join(', ');
console.log(
  `✓ storage: ${manifest.objects} objects, ${manifest.bytes} bytes (${manifest.downloaded} downloaded, ${manifest.reused} reused) — ${perBucket}`,
);
