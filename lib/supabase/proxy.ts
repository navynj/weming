import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import type { Database } from '@/lib/database.types';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env';
import { safeNext } from '@/lib/next-path';
import { fetchWithDeadline, isUnreachable, withDeadline } from '@/lib/supabase/fetch';

/** How long a page may wait on the auth server before giving up on it. */
const AUTH_DEADLINE_MS = 3_000;

/**
 * Routes reachable without a session. Everything else redirects to sign-in.
 * `/dev` holds render fixtures that touch no data and 404 in production.
 */
const PUBLIC_PATHS = ['/sign-in', '/auth/callback', '/auth/sign-out', '/dev'];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    // This call is in front of every request, so it gets a deadline and no
    // retries: a stack that is down should cost one timeout, not four.
    global: { fetch: fetchWithDeadline(3_000) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { pathname, searchParams } = request.nextUrl;

  // The callback has no session to read yet and does its own exchange, so the
  // round trip here would be pure latency on the hottest path in sign-in.
  if (pathname === '/auth/callback') return response;

  // Refreshes the session cookie. Must stay directly after createServerClient:
  // anything between the two can cause hard-to-debug random sign-outs.
  // getClaims, not getUser (2026-10-28): the project signs with an ES256 key,
  // so the token's signature is checked here against the published key (one
  // fetch per ten minutes per instance) instead of asking the auth server on
  // every request; under load that ask hit this deadline again and again.
  // A token is trusted until it expires, as PostgREST trusts it for the data.
  const result = await withDeadline(supabase.auth.getClaims(), AUTH_DEADLINE_MS);

  if (result === 'deadline-exceeded') {
    return unreachable(request, response, pathname);
  }

  const { data, error } = result;
  const user = data?.claims.sub ?? null;

  // "Cannot reach Supabase" is not "not signed in". Saying so costs nothing
  // and saves the next person from reading a redirect to sign-in as a bug in
  // their own code.
  if (error && isUnreachable(error)) {
    return unreachable(request, response, pathname);
  }

  // An OAuth code anywhere but the callback means Supabase did not accept the
  // redirect_to we sent and fell back to site_url. That failure is otherwise
  // silent — the guard below would bounce it to sign-in and it would read as
  // "nothing happened" — so name it instead.
  if (searchParams.has('code') && pathname !== '/auth/callback') {
    return NextResponse.redirect(errorUrl(request, 'redirect_not_allowlisted'));
  }

  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublic) {
    // Where they were headed comes back to them after sign-in (H23): a join
    // link opened signed out returns to the link. Home needs no note.
    const url = cleanUrl(request, '/sign-in');
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/sign-in') {
    return NextResponse.redirect(cleanUrl(request, safeNext(searchParams.get('next'))));
  }

  return response;
}

/** Guard redirects drop the incoming query; carrying it forward only ever
 *  produced misleading URLs like /sign-in?code=… */
function cleanUrl(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  // A `next` path may carry its own query; it is relative and checked by
  // safeNext, so it resolves against this origin and nowhere else.
  const target = new URL(pathname, request.nextUrl.origin);
  url.pathname = target.pathname;
  url.search = target.search;
  return url;
}

function unreachable(request: NextRequest, response: NextResponse, pathname: string): NextResponse {
  console.error('[during] auth server unreachable — is the stack running? (pnpm db:start)');

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return response;
  return NextResponse.redirect(errorUrl(request, 'auth_unreachable'));
}

function errorUrl(request: NextRequest, reason: string): URL {
  const url = cleanUrl(request, '/sign-in');
  url.searchParams.set('error', reason);
  return url;
}
