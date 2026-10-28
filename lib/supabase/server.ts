import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import type { Database } from '@/lib/database.types';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env';
import { fetchWithDeadline } from '@/lib/supabase/fetch';

/**
 * One client per request (review: a place switch asked the auth server for
 * the same user up to five times): every server component of a render
 * shares it, so what is cached on it — the signed-in user, my profile — is
 * asked once. Outside a render (an action, a route handler) `cache` passes
 * through and each call makes its own, as before.
 */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  // Named reads (lib/env.ts): a missing variable fails as `Missing <NAME>`.
  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    global: { fetch: fetchWithDeadline(5_000) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
});
