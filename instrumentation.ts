import * as Sentry from '@sentry/nextjs';

import { scrubTraceHeader, sentryOptions } from '@/lib/observability';

/**
 * Runs once when a server instance starts (Next's `instrumentation.ts`
 * convention), before it takes requests. The required environment is checked
 * here so a deploy with a variable missing fails at startup with the name of
 * the variable, instead of 500ing on whichever route first creates a client
 * — the prod photo incident, where a missing service key took Home down with
 * a generic "supabaseKey is required".
 *
 * Node only: the edge runtime (the proxy) inlines its variables at build and
 * has its own named reads through `lib/env.ts`.
 *
 * Error tracking starts here too, on the server and the edge
 * (lib/observability.ts): scrubbed before anything leaves, off on a local run.
 */
export async function register(): Promise<void> {
  Sentry.init(
    sentryOptions(
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    ),
  );
  scrubTraceHeader(Sentry.getClient());
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertServerEnv } = await import('./lib/env');
    assertServerEnv();
  }
}

/** A server error Next caught — a render, a route, a server action — sent scrubbed. */
export const onRequestError = Sentry.captureRequestError;
