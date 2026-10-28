import * as Sentry from '@sentry/nextjs';

import { scrubText } from './observability';

/** What failed, as Sentry tags it: the operation, never what it carried. */
export type FailedOp = 'upload' | 'compose' | 'edit' | 'join' | 'push' | 'account';

/**
 * A failure someone ran into, sent to Sentry tagged with its operation. Only
 * the reason goes — scrubbed of paths and file names (lib/observability.ts) —
 * never the payload: no titles, words, photos or ids of what was written.
 */
export function reportFailure(op: FailedOp, reason: unknown): void {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'object' && reason !== null && 'message' in reason
        ? String((reason as { message: unknown }).message)
        : String(reason);
  const error = new Error(`${op} failed: ${scrubText(message)}`);
  error.name = `${op[0].toUpperCase()}${op.slice(1)}Failure`;
  Sentry.captureException(error, { tags: { op } });
}

/**
 * A server action's work, reported when it fails: a refusal it returns
 * ({ ok: false, message }) or an error it throws, which is thrown on. The
 * result is handed back unchanged.
 */
export async function reported<R>(op: FailedOp, work: () => Promise<R>): Promise<R> {
  try {
    const result = await work();
    if (isRefusal(result)) reportFailure(op, result.message ?? 'refused');
    return result;
  } catch (error) {
    reportFailure(op, error);
    throw error;
  }
}

function isRefusal(result: unknown): result is { ok: false; message?: string } {
  return typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === false;
}
