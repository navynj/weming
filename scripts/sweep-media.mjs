#!/usr/bin/env node
// The daily media sweep (H70, lib/media-sweep.ts), run once by hand as a
// dry run against a project: what the cron would remove, counted, nothing
// removed. Deleting is the cron's alone (app/api/cron/sweep-media).
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON scripts/sweep-media.mjs
//
// Prints counts and bytes per bucket, never a path or a user id.
import { createClient } from '@supabase/supabase-js';

import { sweepMedia, sweepSummary } from '../lib/media-sweep.ts';
import { createStorage } from '../lib/storage/backend.ts';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    '✖ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (values are never printed).',
  );
  process.exit(2);
}

const report = await sweepMedia({
  storage: createStorage({ supabaseUrl: url, serviceRoleKey: key }),
  db: createClient(url, key, { auth: { persistSession: false } }),
  dryRun: true,
});
console.log(`Media sweep on ${new URL(url).hostname.split('.')[0]}: ${sweepSummary(report)}`);
