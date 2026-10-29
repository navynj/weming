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
 * RPCs that only read: STABLE in their latest migration, so Postgres itself
 * holds them to reading. PostgREST calls every RPC with a POST, but these
 * keep the read deadline; tests/read-rpcs.test.ts keeps this list equal to
 * the migrations.
 */
export const READ_RPCS: ReadonlySet<string> = new Set([
  'account_deletion_preview',
  'invite_members',
  'invite_photo',
  'invite_preview',
  'is_pool_member_object',
  'joint_together',
  'my_left_pool_ripples',
  'my_thread_ripples',
  'placement_together',
  'ripple_replies_in',
  'visible_avatars',
  'visible_pool_photos',
]);

/** A read: GET or HEAD, or a POST to one of READ_RPCS. Anything else may write. */
export function isReadRequest(url: string, method: string): boolean {
  if (method === 'GET' || method === 'HEAD') return true;
  const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url)?.[1];
  return method === 'POST' && rpc !== undefined && READ_RPCS.has(rpc);
}

/** One request as it finished: its status, or how it was cut off. */
export type StepOutcome = number | 'timeout' | 'network';
export type OnStep = (url: string, method: string, ms: number, outcome: StepOutcome) => void;

/**
 * A write gets its own, longer deadline. Aborting a request does not abort
 * the statement: a PATCH cut off at five seconds can still commit, and the
 * author is told it failed while the row changed (Sentry, an edit on a
 * pool's page). Past this a write is reported as failed; until then a slow
 * one is waited for. A read — READ_RPCS included — keeps the short one.
 */
export function fetchWithDeadline(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  writeTimeoutMs: number = timeoutMs,
  onStep?: OnStep,
): typeof fetch {
  return async (input, init) => {
    const caller = init?.signal;
    const method = (init?.method ?? 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const deadline = AbortSignal.timeout(isReadRequest(url, method) ? timeoutMs : writeTimeoutMs);
    const started = performance.now();

    try {
      const response = await fetch(input, {
        ...init,
        signal: caller ? AbortSignal.any([caller, deadline]) : deadline,
      });
      onStep?.(url, method, performance.now() - started, response.status);
      return response;
    } catch (error) {
      onStep?.(url, method, performance.now() - started, deadline.aborted ? 'timeout' : 'network');
      throw error;
    }
  };
}

/** What the author reads when a write was cut off and its outcome is unknown. */
export const UNCONFIRMED = "Couldn't confirm it saved. Check your connection and try again.";

/**
 * True when a Supabase error means the request never got an answer: the
 * deadline above, or the network. supabase-js hands a failed fetch back as
 * an error whose message is the thrown one's name and message.
 */
export function isCutOff(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return /^(TimeoutError|AbortError)\b/.test(message) || message.includes('fetch failed');
}

/** A refusal's words: the database's own, never a raw network error. */
export function writeRefusal(error: { message: string }): string {
  return isCutOff(error) ? UNCONFIRMED : error.message;
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
