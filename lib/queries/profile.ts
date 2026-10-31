import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { tagSentryUser } from '@/lib/sentry-user';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type MyCategory = Database['public']['Tables']['my_categories']['Row'];
export type DuringClient = SupabaseClient<Database>;

/** Who is signed in: the token's subject, the one thing the server asks of it. */
export type AuthUser = { id: string };

/**
 * The signed-in user, read once per request and client (the request's one
 * client, lib/supabase/server.ts); every call after the first in a render
 * shares the answer. Every page, prefetch and action reads it, and every
 * read asking the auth server (`getUser`) was 255 MB of Auth egress a day
 * (2026-10-30). So it is `getClaims`, as the proxy reads it (2026-10-28):
 * the token's signature checked here against the published key, trusted
 * until it expires, as PostgREST trusts it for the data. An expired token is
 * refreshed on the way. The sign-in callback, which needs the profile the
 * provider sent, still asks the auth server for the whole user.
 */
export const getAuthUser = cache(async (supabase: DuringClient): Promise<AuthUser | null> => {
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims.sub ?? null;
  tagSentryUser(id);
  return id ? { id } : null;
});

/** My profile row, read once per request and client like the user it belongs to. */
export const getMyProfile = cache(async (supabase: DuringClient): Promise<Profile | null> => {
  const user = await getAuthUser(supabase);
  if (!user) return null;

  // RLS already limits this to self and linked users; the filter is what makes
  // it a single row, not what makes it safe.
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
});

async function readMyCategories(supabase: DuringClient): Promise<MyCategory[]> {
  const { data, error } = await supabase
    .from('my_categories')
    .select('*')
    .order('position', { ascending: true });

  if (error) throw error;
  return data;
}

/** Read once per request and client: the shell and Home both ask (review: round trips). */
export const getMyCategories = cache(readMyCategories);
