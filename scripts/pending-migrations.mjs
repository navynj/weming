// Which of the repository's migrations production has not applied yet, read
// from production itself (applied_migrations, 0046). Used by the Ignored
// Build Step (vercel-ignore.mjs); kept apart so it can be tested.
import { readdirSync } from 'node:fs';

/** The migration files in a directory, in order: "0045_board_layout_views.sql", … */
export function migrationFiles(dir = 'supabase/migrations') {
  return readdirSync(dir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
}

/**
 * The files production lacks, by version. Throws when production cannot
 * say: a build must never guess that nothing is pending.
 */
export async function pendingMigrations(files, { url, key, fetchImpl = fetch }) {
  if (!url || !key) throw new Error('no Supabase URL or service key in the build');
  const response = await fetchImpl(`${url}/rest/v1/rpc/applied_migrations`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) throw new Error(`production answered ${response.status}`);
  const applied = await response.json();
  if (!Array.isArray(applied)) throw new Error('production answered something other than a list');
  const have = new Set(applied);
  return files.filter((name) => !have.has(name.split('_')[0]));
}
