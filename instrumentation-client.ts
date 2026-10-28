import * as Sentry from '@sentry/nextjs';

import { scrubTraceHeader, sentryOptions } from '@/lib/observability';

// Error tracking in the browser (lib/observability.ts): scrubbed before
// anything leaves, no Session Replay, off on a local run.
Sentry.init(
  sentryOptions(process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT, process.env.NEXT_PUBLIC_SENTRY_RELEASE),
);
scrubTraceHeader(Sentry.getClient());

/** Navigations, for the sampled traces (production only, a tenth). */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
