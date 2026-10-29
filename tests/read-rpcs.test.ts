import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { READ_RPCS } from '@/lib/supabase/fetch';

// A read RPC keeps the 5s read deadline; every other RPC gets the 30s write
// one (lib/supabase/fetch.ts). Postgres decides which is which: a function
// whose latest migration declares it STABLE or IMMUTABLE cannot write.

const MIGRATIONS = 'supabase/migrations';
const SOURCES = ['app', 'features', 'lib'];

/** Each public function's volatility as its latest migration declares it. */
function volatility(): Map<string, 'read' | 'write'> {
  const kinds = new Map<string, 'read' | 'write'>();
  for (const file of readdirSync(MIGRATIONS).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    // The header, up to the body's opening $$: where volatility is declared.
    for (const [header, name] of sql.matchAll(
      /create (?:or replace )?function public\.(\w+)\s*\([\s\S]*?\$\$/gi,
    )) {
      kinds.set(name, /\b(stable|immutable)\b/i.test(header) ? 'read' : 'write');
    }
  }
  return kinds;
}

/** Every RPC the app calls by name. */
function called(): Set<string> {
  const names = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('database.types.ts')) {
        for (const [, name] of readFileSync(path, 'utf8').matchAll(/\.rpc\(\s*'(\w+)'/g)) {
          names.add(name);
        }
      }
    }
  };
  SOURCES.forEach(walk);
  return names;
}

describe('the RPCs held to the read deadline', () => {
  it('are exactly the ones the app calls that their migrations declare STABLE', () => {
    const kinds = volatility();
    const calls = [...called()];
    expect(calls.filter((name) => !kinds.has(name))).toEqual([]);
    expect(new Set(calls.filter((name) => kinds.get(name) === 'read'))).toEqual(new Set(READ_RPCS));
  });
});
