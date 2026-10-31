import { createClient as createServiceClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { supabaseServiceRoleKey, supabaseUrl } from '@/lib/env';

/**
 * Visits to an invite link (H71), signed out included: "link opened N times
 * vs joined M" per pool. A visit is stored as the link and a time; nothing
 * about the visitor. A browser that came back within half an hour — a
 * reload, or the return from sign-in — is not counted again: a cookie on
 * that one path says so, and it holds no identifier either.
 */
const JOIN = /^\/join\/([^/]+)$/;

/** Link previews and crawlers fetch the page too; they are not visits. */
const FETCHER =
  /bot|crawl|spider|preview|facebookexternalhit|kakaotalk-scrap|slack|whatsapp|telegram|discord|embedly|skype|line\/|vkshare/i;

export const SEEN_COOKIE = 'weming_invite_seen';
export const SEEN_SECONDS = 30 * 60;

/** The token a page load of a join link counts, or null when it counts nothing. */
export function countedInviteToken(request: {
  method: string;
  pathname: string;
  headers: Headers;
  seen: boolean;
}): string | null {
  if (request.method !== 'GET' || request.seen) return null;
  const match = JOIN.exec(request.pathname);
  if (!match) return null;
  const h = request.headers;
  // The router's own fetches (a prefetch, a server component's payload).
  if (h.has('rsc') || h.has('next-router-prefetch') || h.get('purpose') === 'prefetch') {
    return null;
  }
  const dest = h.get('sec-fetch-dest');
  if (dest && dest !== 'document') return null;
  if (FETCHER.test(h.get('user-agent') ?? '')) return null;
  return decodeURIComponent(match[1]);
}

/** Counts one visit; a failure is swallowed, a lost count is never a lost page. */
export async function countInviteVisit(token: string): Promise<void> {
  try {
    await createServiceClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
      auth: { persistSession: false },
    }).rpc('count_invite_link_open', { p_token: token });
  } catch {
    // Nothing: see above.
  }
}
