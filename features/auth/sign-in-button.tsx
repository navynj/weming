'use client';

import { useState } from 'react';

import { authCallbackUrl, NEXT_COOKIE, TIMEZONE_COOKIE } from '@/lib/site';
import { createClient } from '@/lib/supabase/client';
import { detectTimezone } from '@/lib/time';

/** `next`: where to return after sign-in, already checked by `safeNext`. */
export function SignInButton({ next = null }: { next?: string | null }) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function signIn(): Promise<void> {
    setPending(true);
    setFailure(null);

    try {
      // Only the browser knows the author's zone, and the callback runs on the
      // server. Short-lived, lax so it survives the redirect back from Google.
      document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(detectTimezone())}; path=/; max-age=600; samesite=lax`;
      // Cleared when absent, so an old link's return cannot outlive it.
      document.cookie = next
        ? `${NEXT_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`
        : `${NEXT_COOKIE}=; path=/; max-age=0; samesite=lax`;

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: authCallbackUrl() },
      });

      // A swallowed error here reads as "the button does nothing", which is
      // the hardest kind of failure to chase. Say it out loud instead.
      if (error) throw error;
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      console.error('[during] sign-in failed', thrown);
      setFailure(message);
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* Google's own button, Neutral theme (its sign-in branding guidelines):
          #F2F2F2 with no border, #1F1F1F words, the unmodified G at the left.
          Its colours are Google's, not ours. The pill matches the pool block's
          corners on the sign-in screen. */}
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        data-google-sign-in
        className="flex h-12 w-full items-center justify-center gap-3 rounded-3xl bg-[#F2F2F2] px-6 text-base font-medium text-[#1F1F1F] disabled:opacity-60"
      >
        <GoogleG />
        {pending ? 'Opening Google…' : 'Continue with Google'}
      </button>

      {failure ? (
        <p role="alert" className="text-pool-500 max-w-sm text-sm">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/** Google's "G", as its branding guidelines ship it: four colours, unmodified. */
function GoogleG() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" width={20} height={20} className="shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
