/**
 * Server-side Supabase calls sit in the request path, so they get a deadline.
 *
 * Without one, an unreachable auth server does not fail — it retries, and the
 * proxy's getUser() blocks every single request for ~25 seconds before the app
 * decides nobody is signed in. A local stack that is simply not running should
 * cost a moment, not a minute.
 */
const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * A write gets its own, longer deadline. Aborting a request does not abort
 * the statement: a PATCH cut off at five seconds can still commit, and the
 * author is told it failed while the row changed (Sentry, an edit on a
 * pool's page). Past this a write is reported as failed; until then a slow
 * one is waited for.
 */
export function fetchWithDeadline(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  writeTimeoutMs: number = timeoutMs,
): typeof fetch {
  return (input, init) => {
    const caller = init?.signal;
    const method = (init?.method ?? 'GET').toUpperCase();
    const isRead = method === 'GET' || method === 'HEAD';
    const deadline = AbortSignal.timeout(isRead ? timeoutMs : writeTimeoutMs);

    return fetch(input, {
      ...init,
      signal: caller ? AbortSignal.any([caller, deadline]) : deadline,
    });
  };
}

/** True when an error means "could not reach the server", not "denied". */
export function isUnreachable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
  if (error.message.includes('fetch failed')) return true;
  // supabase-js wraps a network failure as a retryable auth error with status 0
  return 'status' in error && (error as { status?: number }).status === 0;
}

/**
 * Bounds a whole operation, not just one fetch.
 *
 * supabase-js retries a failed auth call with backoff, so capping each
 * individual request still adds up to tens of seconds. The proxy needs a
 * ceiling on the answer, not on the attempts.
 */
export async function withDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T | 'deadline-exceeded'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'deadline-exceeded'>((resolve) => {
    timer = setTimeout(() => resolve('deadline-exceeded'), timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
