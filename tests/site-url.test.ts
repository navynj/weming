import { describe, expect, it } from 'vitest';

import { resolveSiteUrl } from '@/lib/site';

describe('the deployment’s origin (review)', () => {
  it('is NEXT_PUBLIC_SITE_URL when set, without a trailing slash', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://example.test/' })).toBe(
      'https://example.test',
    );
    // Set wins over a preview's branch URL.
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'https://example.test',
        VERCEL_ENV: 'preview',
        VERCEL_BRANCH_URL: 'weming-git-x.vercel.app',
      }),
    ).toBe('https://example.test');
  });

  it('is a Vercel preview’s own branch URL when unset, so no branch needs a value of its own', () => {
    expect(
      resolveSiteUrl({
        VERCEL_ENV: 'preview',
        VERCEL_BRANCH_URL: 'weming-git-feat-board-layout-navynjs-projects.vercel.app',
      }),
    ).toBe('https://weming-git-feat-board-layout-navynjs-projects.vercel.app');
  });

  it('has no fallback in production, nor anywhere but a preview', () => {
    expect(
      resolveSiteUrl({ VERCEL_ENV: 'production', VERCEL_BRANCH_URL: 'weming-git-main.vercel.app' }),
    ).toBeNull();
    expect(resolveSiteUrl({ VERCEL_BRANCH_URL: 'weming-git-x.vercel.app' })).toBeNull();
    expect(resolveSiteUrl({})).toBeNull();
  });
});
