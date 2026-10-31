/**
 * The server's environment, named.
 *
 * After the prod photo incident: `SUPABASE_SERVICE_ROLE_KEY` was missing on
 * Vercel, `createClient(url, undefined)` threw its generic "supabaseKey is
 * required" from inside Home's render, and the whole site was down with
 * nothing in the logs naming the variable. Every read goes through here so
 * a missing value fails as `Missing <NAME>`, and `instrumentation.ts` checks
 * the whole list once at startup so it fails there, named, rather than in
 * whichever route touches it first.
 *
 * References to `process.env.X` stay static: Next inlines those for the
 * browser and the edge runtime, and a dynamic `process.env[name]` is empty
 * there. Nothing here creates a client — client creation lives inside the
 * functions that need one, never at a module's top level, so one missing
 * variable cannot poison every route's chunk.
 */
export const SERVER_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SITE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

export type ServerEnvName = (typeof SERVER_ENV)[number];

/** A static snapshot, so the check and the accessors read the same values. */
function snapshot(): Record<ServerEnvName, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/** The value, or a failure that names the variable. */
export function requireEnv(name: ServerEnvName, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/** Which of the required variables are absent or empty. */
export function missingServerEnv(
  env: Partial<Record<ServerEnvName, string | undefined>> = snapshot(),
): ServerEnvName[] {
  return SERVER_ENV.filter((name) => !env[name]);
}

/** Fails once, naming every missing variable, so the log says what to set. */
export function assertServerEnv(
  env: Partial<Record<ServerEnvName, string | undefined>> = snapshot(),
): void {
  const missing = missingServerEnv(env);
  if (missing.length > 0) throw new Error(`Missing ${missing.join(', ')}`);
}

export function supabaseUrl(): string {
  return requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Server-only: bypasses RLS. Read where a service client is made, never earlier. */
export function supabaseServiceRoleKey(): string {
  return requireEnv('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Web Push's keys (H32), or null. Optional on purpose, unlike SERVER_ENV: a
 * deploy that lands before the keys are set must not take the site down, so
 * without them the bell still works and nothing is pushed.
 */
export function vapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/**
 * The accounts that may open /admin (H71): user ids, comma separated.
 * Optional, like the push keys: unset, nobody is an admin and the
 * dashboard is a 404 for everyone.
 */
export function adminUserIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}
