import { describe, expect, it } from 'vitest';

import { countedInviteToken } from '@/lib/invite-visits';

/** Which loads of a join link count as a visit (H71). */
const visit = (
  over: {
    method?: string;
    pathname?: string;
    headers?: Record<string, string>;
    seen?: boolean;
  } = {},
) =>
  countedInviteToken({
    method: over.method ?? 'GET',
    pathname: over.pathname ?? '/join/tok123',
    headers: new Headers({
      'sec-fetch-dest': 'document',
      'user-agent': 'Mozilla/5.0 (iPhone)',
      ...over.headers,
    }),
    seen: over.seen ?? false,
  });

describe('an invite link visit', () => {
  it('counts a page load of a join link, signed in or not', () => {
    expect(visit()).toBe('tok123');
  });

  it('counts nothing else', () => {
    expect(visit({ pathname: '/join/tok123/extra' })).toBeNull();
    expect(visit({ pathname: '/pool/p' })).toBeNull();
    expect(visit({ method: 'POST' })).toBeNull();
  });

  it('skips the same browser within half an hour (a reload, the return from sign-in)', () => {
    expect(visit({ seen: true })).toBeNull();
  });

  it("skips the router's own fetches and link previews", () => {
    expect(visit({ headers: { rsc: '1' } })).toBeNull();
    expect(visit({ headers: { 'next-router-prefetch': '1' } })).toBeNull();
    expect(visit({ headers: { 'sec-fetch-dest': 'empty' } })).toBeNull();
    expect(visit({ headers: { 'user-agent': 'facebookexternalhit/1.1' } })).toBeNull();
    expect(visit({ headers: { 'user-agent': 'kakaotalk-scrap/1.0' } })).toBeNull();
    expect(visit({ headers: { 'user-agent': 'Slackbot-LinkExpanding 1.0' } })).toBeNull();
  });
});
