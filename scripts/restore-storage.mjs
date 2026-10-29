#!/usr/bin/env node
// Re-uploads one bucket's folder from a backup into a project's bucket.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/restore-storage.mjs <backup>/storage <bucket> [--overwrite]
//
// Each object goes back to its own path with the content type the manifest
// recorded. Objects already in the bucket are left alone unless --overwrite.
// Before writing anything it names the target project and waits for its ref
// to be typed: a restore aimed at the wrong project is the mistake to stop.
//
// Writes through the storage adapter (lib/storage), as the backup reads, so a
// change of backend changes neither script. Run with
// --no-warnings=MODULE_TYPELESS_PACKAGE_JSON (DEPLOY.md, Restoring storage).
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { createStorage } from '../lib/storage/backend.ts';
import { BUCKETS } from '../lib/storage/types.ts';

const [dirArg, bucket] = process.argv.slice(2);
const overwrite = process.argv.includes('--overwrite');
if (!dirArg || !BUCKETS.includes(bucket)) {
  console.error(`usage: restore-storage.mjs <backup>/storage <${BUCKETS.join('|')}> [--overwrite]`);
  process.exit(2);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✖ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(2);
}

const dir = resolve(dirArg);
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
const items = manifest.items.filter((item) => item.bucket === bucket);
const ref = new URL(url).hostname.split('.')[0];

console.log(`Restore ${items.length} object(s) into "${bucket}" of project ${ref}`);
console.log(overwrite ? '  existing objects will be OVERWRITTEN' : '  existing objects are kept');
const ask = createInterface({ input: process.stdin, output: process.stdout });
const typed = (await ask.question(`Type the project ref (${ref}) to go ahead: `)).trim();
ask.close();
if (typed !== ref) {
  console.error('✖ Not confirmed; nothing was written.');
  process.exit(1);
}

const storage = createStorage({ supabaseUrl: url, serviceRoleKey: key });
const base = resolve(dir, bucket);
let uploaded = 0;
let kept = 0;
let failed = 0;
for (const item of items) {
  const file = resolve(base, item.path);
  if (!file.startsWith(base + sep)) throw new Error('an object path escapes its bucket folder');
  const body = await readFile(file);
  try {
    await storage.put(bucket, item.path, body, {
      contentType: item.contentType ?? 'application/octet-stream',
      upsert: overwrite,
    });
    uploaded += 1;
  } catch (error) {
    if (!overwrite && /exists|duplicate/i.test(error.message)) kept += 1;
    else {
      failed += 1;
      console.error(`✖ ${item.path}: ${error.message}`);
    }
  }
}
console.log(`✓ ${uploaded} uploaded, ${kept} already there, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
