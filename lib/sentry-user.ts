import * as Sentry from '@sentry/nextjs';

/**
 * Who ran into an error (lib/observability.ts): the Supabase user id and
 * nothing else — no email, no name — so an event can be traced to an
 * account by looking the id up in Supabase, while Sentry itself holds no
 * one's address. Null clears it.
 */
export function tagSentryUser(id: string | null): void {
  Sentry.setUser(id ? { id } : null);
}

type GetUser = (...args: never[]) => Promise<{ data: { user: { id: string } | null } }>;

/**
 * Every server read of the signed-in user tags the request's Sentry scope
 * with its id: the app reads the user in many places (actions, pages, the
 * shell), and this is the one they all pass through.
 */
export function tagUserOnRead<C extends { auth: { getUser: GetUser } }>(client: C): C {
  const read = client.auth.getUser.bind(client.auth) as GetUser;
  client.auth.getUser = (async (...args: never[]) => {
    const result = await read(...args);
    tagSentryUser(result.data.user?.id ?? null);
    return result;
  }) as C['auth']['getUser'];
  return client;
}
