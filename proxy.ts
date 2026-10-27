import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/proxy';

export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

/**
 * Everything except static files.
 *
 * `.webmanifest` is load-bearing: browsers fetch the manifest **anonymously**
 * (no cookies, unless the link opts in), so a session check on that path sends
 * them a 307 to /sign-in. The manifest then fails to parse, the install
 * criteria are never met, and the home-screen shortcut opens as a plain
 * bookmark with the URL bar showing — signed in or not. `sw.js` (H32) the
 * same: the browser re-checks the push worker in the background, where a
 * redirect would fail the update.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
