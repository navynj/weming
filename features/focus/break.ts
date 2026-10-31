// DORMANT (H20b): no surface reaches this since the Splash pivot. Kept, with
// its tests, for P3's Swim. Do not wire it back in; do not delete it.
'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/queries/profile';
import type { CommitResult } from '@/features/input-sheet/commit';

/**
 * Starts a break inside the running session: a timed inner ripple that
 * inherits the session's category (H15a2).
 *
 * No category of its own, and nothing to hide from a picker: inner
 * composition is Drop-only, so this button is the only thing that makes a
 * timed child, and "timed inner ripple" and "break" are the same set.
 *
 * The session itself is untouched — its span stays one interval and its
 * duration stays gross.
 */
export async function startBreak(sessionId: string): Promise<CommitResult> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false, reason: 'error', message: 'Sign in again.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();

  const zone = profile?.timezone ?? 'UTC';
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const at = Object.fromEntries(local.map((part) => [part.type, part.value]));

  const { data: parent } = await supabase.from('ripples').select('id').eq('id', sessionId).single();
  if (!parent) return { ok: false, reason: 'error', message: 'That session is gone.' };

  const { data, error } = await supabase
    .from('ripples')
    .insert({
      author_id: user.id,
      note: null,
      occurred_on: `${at.year}-${at.month}-${at.day}`,
      occurred_time: `${at.hour}:${at.minute}`,
      ended_at: null,
      parent_ripple_id: sessionId,
    })
    .select('id')
    .single();

  if (error) return { ok: false, reason: 'error', message: error.message };

  revalidatePath('/');
  revalidatePath('/now');
  return { ok: true, rippleId: data.id };
}

/** Ends the break and lets the water flow again. */
export async function endBreak(breakId: string): Promise<CommitResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('ripples')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', breakId)
    .is('ended_at', null);

  if (error) return { ok: false, reason: 'error', message: error.message };

  revalidatePath('/');
  revalidatePath('/now');
  return { ok: true, rippleId: breakId };
}

/**
 * Stops the session, closing a running break first.
 *
 * The order is load-bearing: a parent's span shrinks to its end, and a child
 * still running would be left outside it.
 */
export async function stopSessionWithBreak(
  sessionId: string,
  openBreakId: string | null,
): Promise<CommitResult> {
  if (openBreakId) {
    const closed = await endBreak(openBreakId);
    if (!closed.ok) return closed;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('ripples')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('ended_at', null);

  if (error) return { ok: false, reason: 'error', message: error.message };

  revalidatePath('/');
  revalidatePath('/now');
  return { ok: true, rippleId: sessionId };
}
