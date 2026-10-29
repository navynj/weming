#!/usr/bin/env node
// Strips metadata — EXIF, XMP, IPTC, comments, text chunks — from every image
// already in storage, pixels untouched (scripts/image-metadata.mjs), and puts
// each back at its own path. A one-off for photos uploaded before the
// browser redrew every one (2026-10-28): a small photo went up as it was,
// its location with it.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON scripts/scrub-image-metadata.mjs [--apply]
//
// Without --apply it changes nothing and prints counts per bucket: how many
// objects, of which format, carry metadata, carry a location, keep a
// non-default orientation, or are in a format it does not rewrite. Never a
// path and never a coordinate: object paths carry user ids.
//
// With --apply it needs a backup from today in backups/ (pnpm backup), names
// the project and waits for its ref to be typed, then rewrites what carries
// metadata, checks each result carries none, and moves the photo version of
// each avatar and pool photo it rewrote, so a cached signed URL is reissued.
// Run again, it finds nothing left to do.
import { createClient } from '@supabase/supabase-js';
import { readdirSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

import { createStorage, listAll } from '../lib/storage/backend.ts';
import { BUCKETS } from '../lib/storage/types.ts';
import { formatOf, inspect, strip } from './image-metadata.mjs';

const apply = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    '✖ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (values are never printed).',
  );
  process.exit(2);
}
const ref = new URL(url).hostname.split('.')[0];
const storage = createStorage({ supabaseUrl: url, serviceRoleKey: key });

const TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const CACHE = { 'ripple-media': 3600, avatars: 86400, 'pool-photos': 86400 };
const PARALLEL = 4;

if (apply) {
  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  let backups = [];
  try {
    backups = readdirSync('backups').filter((name) => name.startsWith(`${today}-`));
  } catch {
    // No backups folder: refused below.
  }
  if (backups.length === 0) {
    console.error('✖ No backup from today in backups/. Run `pnpm backup` first.');
    process.exit(1);
  }
  console.log(`Strip image metadata in every bucket of project ${ref}, in place.`);
  const ask = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await ask.question(`Type the project ref (${ref}) to go ahead: `)).trim();
  ask.close();
  if (typed !== ref) {
    console.error('✖ Not confirmed; nothing was written.');
    process.exit(1);
  }
}

const empty = () => ({
  objects: 0,
  formats: {},
  metadata: 0,
  gps: 0,
  orientationKept: 0,
  unsupportedWithMetadata: 0,
  rewritten: 0,
  failed: 0,
});
const report = Object.fromEntries(BUCKETS.map((bucket) => [bucket, empty()]));
const rewritten = { avatars: [], 'pool-photos': [] };

async function visit(bucket, info) {
  const tally = report[bucket];
  tally.objects += 1;
  let bytes;
  try {
    bytes = await storage.get(bucket, info.path);
  } catch {
    tally.failed += 1;
    return;
  }
  const found = inspect(bytes);
  tally.formats[found.format] = (tally.formats[found.format] ?? 0) + 1;
  if (!found.metadata) return;
  tally.metadata += 1;
  if (found.gps) tally.gps += 1;
  if (found.orientation && found.orientation !== 1) tally.orientationKept += 1;
  if (!found.supported) {
    tally.unsupportedWithMetadata += 1;
    return;
  }
  if (!apply) return;

  const clean = strip(bytes);
  const after = clean && inspect(clean);
  // Never written unless the result is the same format and carries nothing.
  if (!clean || !after || after.metadata || after.gps || formatOf(clean) !== found.format) {
    tally.failed += 1;
    return;
  }
  try {
    await storage.put(bucket, info.path, clean, {
      contentType: TYPES[found.format],
      cacheControl: CACHE[bucket],
      upsert: true,
    });
    tally.rewritten += 1;
    if (bucket in rewritten) rewritten[bucket].push(info.path);
  } catch {
    tally.failed += 1;
  }
}

for (const bucket of BUCKETS) {
  const objects = await listAll(storage, bucket);
  for (let i = 0; i < objects.length; i += PARALLEL) {
    await Promise.all(objects.slice(i, i + PARALLEL).map((info) => visit(bucket, info)));
  }
}

// A new version is a new signed URL (lib/avatars.ts): the old one, cached by
// the server for a day, would keep serving the bytes it was issued for.
let bumped = 0;
if (apply) {
  const db = createClient(url, key, { auth: { persistSession: false } });
  for (const [table, idColumn, versionColumn, bucket] of [
    ['profiles', 'id', 'avatar_version', 'avatars'],
    ['pools', 'id', 'photo_version', 'pool-photos'],
  ]) {
    for (const id of rewritten[bucket]) {
      const { data, error } = await db
        .from(table)
        .select(versionColumn)
        .eq(idColumn, id)
        .maybeSingle();
      if (error || !data || data[versionColumn] === null) continue;
      const { error: bumpError } = await db
        .from(table)
        .update({ [versionColumn]: data[versionColumn] + 1 })
        .eq(idColumn, id);
      if (bumpError) report[bucket].failed += 1;
      else bumped += 1;
    }
  }
}

console.log(apply ? `✓ applied to ${ref}` : `dry run on ${ref} (nothing written)`);
for (const bucket of BUCKETS) {
  const t = report[bucket];
  const formats = Object.entries(t.formats)
    .map(([format, n]) => `${format} ${n}`)
    .join(', ');
  console.log(
    `  ${bucket}: ${t.objects} objects (${formats || 'none'}); ` +
      `${t.metadata} with metadata, ${t.gps} with a location, ` +
      `${t.orientationKept} keeping a non-default orientation, ` +
      `${t.unsupportedWithMetadata} in a format not rewritten` +
      (apply
        ? `; ${t.rewritten} rewritten, ${t.failed} failed`
        : t.failed
          ? `; ${t.failed} unreadable`
          : ''),
  );
}
if (apply) console.log(`  photo versions moved: ${bumped}`);
process.exit(Object.values(report).some((t) => t.failed > 0) ? 1 : 0);
