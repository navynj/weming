import { describe, expect, it } from 'vitest';

import { placesToWarm } from '@/features/home/recent-places';

// Only the two places I went to last are prefetched in full (the 2026-10-28
// storm: every place, on every invalidation).
describe('the places the strip prefetches in full', () => {
  const strip = ['/', '/pool/a', '/pool/b', '/pool/c', '/pool/d'];

  it('are the two I went to last, never where I am', () => {
    expect(placesToWarm('/pool/c', strip, ['/pool/c', '/pool/a', '/', '/pool/d'])).toEqual([
      '/pool/a',
      '/',
    ]);
  });

  it('fall back to the strip’s own order while there is no history', () => {
    expect(placesToWarm('/', strip, [])).toEqual(['/pool/a', '/pool/b']);
  });

  it('skip a place no longer on the strip (a pool I left)', () => {
    expect(placesToWarm('/', strip, ['/pool/gone', '/pool/d'])).toEqual(['/pool/d', '/pool/a']);
  });
});
