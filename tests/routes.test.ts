import { describe, expect, it } from 'vitest';

import {
  canonicalPath,
  idFromUrl,
  lanePath,
  poolLanePath,
  poolPath,
  poolSplashPath,
  splashPath,
  urlId,
} from '@/lib/routes';
import { toShortId } from '@/lib/short-id';

const POOL = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';
const SPLASH = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const P = toShortId(POOL);
const S = toShortId(SPLASH);

describe('ids in URLs (H62)', () => {
  it('links carry short ids', () => {
    expect(splashPath(SPLASH)).toBe(`/splash/${S}`);
    expect(lanePath(SPLASH)).toBe(`/lane/${S}`);
    expect(poolPath(POOL)).toBe(`/pool/${P}`);
    expect(poolSplashPath(POOL, SPLASH)).toBe(`/pool/${P}/splash/${S}`);
    expect(poolLanePath(POOL, SPLASH)).toBe(`/pool/${P}/lane/${S}`);
  });

  it('passes an id that is not a uuid as it is', () => {
    expect(urlId('p-ours')).toBe('p-ours');
    expect(poolSplashPath('p', 's')).toBe('/pool/p/splash/s');
  });

  it('reads both forms back to the uuid', () => {
    expect(idFromUrl(P)).toBe(POOL);
    expect(idFromUrl(POOL)).toBe(POOL);
    expect(idFromUrl(POOL.toUpperCase())).toBe(POOL);
  });

  it('reads a malformed id as the uuid of no record, the same not-found as a missing one', () => {
    const none = '00000000-0000-0000-0000-000000000000';
    for (const bad of ['nope', 'z'.repeat(22), `${P}x`, '']) expect(idFromUrl(bad)).toBe(none);
  });

  it('respells an old uuid path, and leaves a short one alone', () => {
    expect(canonicalPath(`/splash/${SPLASH}`)).toBe(`/splash/${S}`);
    expect(canonicalPath(`/pool/${POOL}`)).toBe(`/pool/${P}`);
    expect(canonicalPath(`/pool/${POOL}/splash/${SPLASH}`)).toBe(`/pool/${P}/splash/${S}`);
    expect(canonicalPath(`/pool/${P}/lane/${SPLASH}`)).toBe(`/pool/${P}/lane/${S}`);
    expect(canonicalPath(`/pool/${POOL}/settings`)).toBe(`/pool/${P}/settings`);
    expect(canonicalPath(`/pool/${P}/splash/${S}`)).toBeNull();
    expect(canonicalPath('/pool/new')).toBeNull();
    expect(canonicalPath('/')).toBeNull();
    // A uuid anywhere else is not an id this layer spells.
    expect(canonicalPath(`/join/${POOL}`)).toBeNull();
  });
});
