import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { after } from 'next/server';

import { isReadRequest, type StepOutcome } from '@/lib/supabase/fetch';

/**
 * Where a server action's time went (the 5-second edit on a pool's page,
 * 2026-10-28: the error said only that it timed out). Every request the
 * server's Supabase client makes is a step, named by what it touched —
 * "PATCH splashes", "rpc move_pool_splash", "GET auth/user" — never by what
 * it carried: no query string, no id, no body. A server action that wrote
 * sends one Sentry log when it ends, with its steps and their times, whether
 * or not its trace was sampled; an error in that request carries the steps
 * so far as its `action` context. Its duration runs from the start of its
 * first request to the end of its last: the time spent waiting on Supabase.
 *
 * Steps are kept per request on Sentry's isolation scope, which the SDK forks
 * for each one (the same scope lib/sentry-user.ts tags).
 */

type Step = { name: string; ms: number; outcome: StepOutcome };
type Timing = { started: number; ended: number; steps: Step[]; wrote: boolean };

const timings = new WeakMap<object, Timing>();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** A step a second or longer, or one that failed, makes the log a warning. */
const SLOW_MS = 1_000;
/** A request makes a few dozen at most; past this one scope is not one request. */
const MAX_STEPS = 80;

/** A request's name by what it touched: its table, function or service, nothing it carried. */
export function stepName(url: string, method: string): string {
  let parts: string[];
  try {
    parts = new URL(url).pathname.split('/').filter(Boolean);
  } catch {
    return `${method} ?`;
  }
  const [service, , first, second] = parts;
  let name: string;
  if (service === 'rest' && first === 'rpc' && second) name = `rpc ${second}`;
  else if (service === 'rest' && first) name = `${method} ${first}`;
  else if ((service === 'auth' || service === 'storage') && first)
    name = `${method} ${service}/${first}`;
  else name = `${method} ${service ?? '?'}`;
  return name.replace(UUID, '[id]');
}

/** The steps as one line: "GET auth/user 92ms 200 · PATCH splashes 5003ms timeout". */
export function describeSteps(steps: Step[]): string {
  return steps.map((s) => `${s.name} ${Math.round(s.ms)}ms ${s.outcome}`).join(' · ');
}

/** fetchWithDeadline's onStep on the server: one finished request. */
export function recordStep(url: string, method: string, ms: number, outcome: StepOutcome): void {
  const scope = Sentry.getIsolationScope();
  const now = performance.now();
  let timing = timings.get(scope);
  if (!timing) {
    timing = { started: now - ms, ended: now, steps: [], wrote: false };
    timings.set(scope, timing);
    scheduleFlush(timing);
  }
  if (timing.steps.length >= MAX_STEPS) return;
  timing.steps.push({ name: stepName(url, method), ms, outcome });
  timing.ended = now;
  if (!isReadRequest(url, method)) timing.wrote = true;
  scope.setContext('action', {
    duration_ms: Math.round(timing.ended - timing.started),
    steps: describeSteps(timing.steps),
  });
}

function scheduleFlush(timing: Timing): void {
  try {
    after(async () => {
      if (!timing.wrote || !(await isServerAction())) return;
      const slow = timing.steps.some(
        (s) => s.ms >= SLOW_MS || typeof s.outcome !== 'number' || s.outcome >= 400,
      );
      const attributes = {
        'action.duration_ms': Math.round(timing.ended - timing.started),
        'action.step_count': timing.steps.length,
        'action.steps': describeSteps(timing.steps),
        'action.slowest': [...timing.steps].sort((a, b) => b.ms - a.ms)[0]?.name ?? '',
      };
      if (slow) Sentry.logger.warn('server action timing', attributes);
      else Sentry.logger.info('server action timing', attributes);
      await Sentry.flush(2_000);
    });
  } catch {
    // Outside a request (a script, a test): nothing to flush into.
  }
}

/** A server action's request carries Next's action header; a page render does not. */
async function isServerAction(): Promise<boolean> {
  try {
    return (await headers()).has('next-action');
  } catch {
    return false;
  }
}
