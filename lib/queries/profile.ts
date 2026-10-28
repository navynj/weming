import { cache } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type MyCategory = Database['public']['Tables']['my_categories']['Row'];
export type DuringClient = SupabaseClient<Database>;

/**
 * The signed-in user, asked of the auth server once per request and client
 * (the request's one client, lib/supabase/server.ts); every call after the
 * first in a render shares the answer.
 */
export const getAuthUser = cache(async (supabase: DuringClient): Promise<User | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
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
