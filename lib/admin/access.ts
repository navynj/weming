import { notFound } from 'next/navigation';
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { adminUserIds, supabaseServiceRoleKey, supabaseUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

/**
 * The dashboard's door (H71). Every admin page asks here, itself: a layout's
 * check does not hold its pages, which render apart from it.
 *
 * Anyone not listed in ADMIN_USER_IDS gets the same 404 as a path that does
 * not exist, so the route says nothing about itself. Signed out, the proxy
 * has already sent them to sign in, as it does for every path.
 *
 * The service client is made here, after the check and nowhere else in the
 * dashboard, and handed on able to call functions only: the admin_*
 * functions (0071) are its whole reach, and they select no content.
 * scripts/check-admin.sh holds the rest of that line.
 */
export type AdminDb = Pick<SupabaseClient<Database>, 'rpc'>;

export type Admin = { id: string; db: AdminDb };

export function isAdmin(userId: string | null | undefined, ids = adminUserIds()): boolean {
  return Boolean(userId) && ids.includes(userId!);
}

export async function requireAdmin(): Promise<Admin> {
  const supabase = await createClient();
  // Asked of the auth server, not read off the cookie: this door opens the
  // service role.
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id ?? null;
  if (!id || !isAdmin(id)) notFound();
  const db = createServiceClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false },
  });
  return { id, db };
}
