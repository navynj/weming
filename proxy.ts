import { NextResponse, type NextRequest } from 'next/server';

import { canonicalPath } from '@/lib/routes';
import { updateSession } from '@/lib/supabase/proxy';

export default async function proxy(request: NextRequest) {
  // An old link with a uuid in it moves to its short-id spelling (H62),
  // whether or not the record exists: the redirect says nothing about it.
  const short = request.method === 'GET' ? canonicalPath(request.nextUrl.pathname) : null;
  if (short) {
    const url = request.nextUrl.clone();
    url.pathname = short;
    // Temporary (307), so a browser keeps no redirect it would hold past a revert.
    return NextResponse.redirect(url);
  }
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
