import { createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/** The local stack's fixed JWT secret, printed by `supabase start`. */
const LOCAL_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Mints a session for a seeded account.
 *
 * The tests go through PostgREST with a real user token rather than the
 * service-role key, because the service role bypasses RLS — which is the only
 * thing under test here.
 */
export function asUser(userId: string): SupabaseClient<Database> {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      sub: userId,
      aud: 'authenticated',
      role: 'authenticated',
      iss: 'supabase-demo',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const signature = createHmac('sha256', LOCAL_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  const token = `${header}.${payload}.${signature}`;

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

/** Seeded accounts (supabase/seed.sql). */
export const YOONJI = '8d798ff1-3d4e-4316-86e0-dd883cae41a0';
export const MINA = 'a9a48458-96df-4da7-8b9d-b3f7a0b35351';
export const JAE = '46eb0b0a-17ec-41b7-be7a-156f24618590';

/** Yoonji's locked Ripple and one of her unlocked ones. */
export const LOCKED_RIPPLE = '8a8046d5-5b9c-4598-9550-ffff4fd9cdd5';
export const UNLOCKED_RIPPLE = 'bc3c7207-bd71-401a-a26d-7bde347f6285';
export const JAE_RIPPLE = 'f3ad7f54-e879-420f-a44e-e5e2f22c8d55';

/** Service-role client. Bypasses RLS, so it is only ever used for fixtures. */
export function asAdmin(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** A client with no session, for asserting that the door is shut by default. */
export function anonymous(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
