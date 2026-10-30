import { SignInButton } from '@/features/auth/sign-in-button';
import { safeNext } from '@/lib/next-path';
import { authCallbackUrl } from '@/lib/site';

const ERRORS: Record<string, string> = {
  redirect_not_allowlisted: `Sign-in came back to the wrong address. Supabase did not accept ${authCallbackUrl()} as a return URL, so it fell back to site_url. Add that exact URL to additional_redirect_urls in supabase/config.toml and restart with pnpm db:start.`,
  exchange_failed: 'Google signed you in, but the session exchange failed. Try again.',
  missing_code: 'Sign-in returned without an authorization code. Try again.',
  auth_unreachable:
    'Cannot reach Supabase. The local stack is probably not running — start it with pnpm db:start (and make sure OrbStack or Docker is up).',
};

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const params = await searchParams;
  const key = typeof params.error === 'string' ? params.error : null;
  const message = key
    ? (ERRORS[key] ?? 'Sign-in failed. Try again.')
    : params.deleted === '1'
      ? 'Your account was deleted.'
      : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 text-center">
      {/* The title, the soft line, then the bold line right above the button,
          and a note under it (H65, revised). */}
      <div className="max-w-xs space-y-3">
        <h1 className="text-main-900 text-3xl font-semibold">Weming Diary</h1>
        {/* Breaks only between its halves, never inside one. */}
        <p className="text-pool-500 text-sm font-light">
          <span className="whitespace-nowrap">We&rsquo;re swimming side by side,</span>{' '}
          <span className="whitespace-nowrap">each in our own lane.</span>
        </p>
      </div>

      <div className="flex flex-col items-center">
        <p className="text-ink mb-4 font-semibold">Pool your days.</p>
        <SignInButton next={typeof params.next === 'string' ? safeNext(params.next) : null} />
        <p className="text-pool-500 mt-5 text-xs font-light">For a few close friends.</p>
      </div>

      {message ? (
        <p
          role="alert"
          className="bg-pool-100 text-ink max-w-sm rounded-lg px-4 py-3 text-left text-sm"
        >
          {message}
        </p>
      ) : null}
    </main>
  );
}
