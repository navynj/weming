import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { bootstrapProfile } from '@/features/auth/bootstrap-profile';
import { safeNext } from '@/lib/next-path';
import { isTimeZone } from '@/lib/time';
import { NEXT_COOKIE, siteUrl, TIMEZONE_COOKIE } from '@/lib/site';
import { createClient } from '@/lib/supabase/server';
import { WELCOME_HOME } from '@/features/notifications/welcome';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code');
  const home = siteUrl();

  if (!code) {
    return NextResponse.redirect(`${home}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${home}/sign-in?error=exchange_failed`);
  }

  const cookieStore = await cookies();
  const sent = cookieStore.get(TIMEZONE_COOKIE)?.value;
  // Only a zone the runtime knows is stored: the database cuts days in it.
  const timezone = sent && isTimeZone(decodeURIComponent(sent)) ? sent : undefined;

  const { user } = data;
  // Idempotent: an account can reach here with a session but no profile if an
  // earlier attempt died after the exchange, and this is where it recovers.
  const first = await bootstrapProfile(supabase, {
    userId: user.id,
    displayName:
      user.user_metadata.full_name ?? user.user_metadata.name ?? user.email?.split('@')[0] ?? 'You',
    avatarUrl: user.user_metadata.avatar_url ?? null,
    timezone: timezone ? decodeURIComponent(timezone) : 'UTC',
  });

  const next = cookieStore.get(NEXT_COOKIE)?.value;
  // A returning author signing in somewhere new: the profile follows the
  // device's zone, so the next record lands on the day being lived (0013).
  if (timezone) {
    await supabase
      .from('profiles')
      .update({ timezone: decodeURIComponent(timezone) })
      .eq('id', user.id);
  }

  const to = safeNext(next ? decodeURIComponent(next) : null);
  // A first sign-in that lands on Home is greeted with the notifications
  // card once (review); one that came through an invite gets the pool's.
  const response = NextResponse.redirect(`${home}${first && to === '/' ? WELCOME_HOME : to}`);
  response.cookies.delete(TIMEZONE_COOKIE);
  response.cookies.delete(NEXT_COOKIE);
  return response;
}
