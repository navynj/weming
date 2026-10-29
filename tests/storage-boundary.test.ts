import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every storage call goes through the adapter (lib/storage, 2026-10-28):
 * who may see an object is decided before lib/storage signs or writes, and a
 * storage client used anywhere else is a way around that check and a call a
 * second backend would never see. `scripts/check-storage.sh` says the same
 * in `pnpm lint`; this holds it in the suite. Tests are exempt: the database
 * tests ask the buckets' policies directly, as each user.
 */
const ROOTS = ['app', 'features', 'components', 'lib', 'scripts'];
const CODE = /\.(ts|tsx|mjs|js)$/;
const CALL = /\.storage\b|\/storage\/v1\//;
const ALLOW = 'storage-boundary: allow';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return CODE.test(name) ? [path] : [];
  });
}

function outsideAdapter(): string[] {
  return ROOTS.flatMap(files)
    .filter((path) => !path.startsWith('lib/storage/') && path !== 'lib/database.types.ts')
    .flatMap((path) => {
      const lines = readFileSync(path, 'utf8').split('\n');
      return lines.flatMap((line, at) =>
        CALL.test(line) && !line.includes(ALLOW) && !lines[at - 1]?.includes(ALLOW)
          ? [`${path}:${at + 1}: ${line.trim()}`]
          : [],
      );
    });
}

describe('the storage boundary', () => {
  it('has no storage call outside lib/storage', () => {
    expect(outsideAdapter()).toEqual([]);
  });

  it('agrees with the lint check', () => {
    expect(execFileSync('./scripts/check-storage.sh', { encoding: 'utf8' })).toContain(
      'every storage call goes through lib/storage',
    );
  });

  it('would catch a direct call', () => {
    expect(CALL.test("const { data } = await supabase.storage.from('avatars')")).toBe(true);
    expect(CALL.test('await fetch(`${url}/storage/v1/object/ripple-media/x`)')).toBe(true);
    expect(CALL.test("import { storage } from '@/lib/storage';")).toBe(false);
  });
});
