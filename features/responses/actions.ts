'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { ActionOutcome } from '@/lib/use-optimistic-action';
import { createClient } from '@/lib/supabase/server';
import { pushAfter } from '@/lib/notifications/after';

import { isOneEmoji, REPLY_MAX } from './model';

/**
 * Reactions and replies (H25). Each is one call the database checks in full
 * (0030: can_see_ripple, the lock, who wrote what); these only shape the
 * input and say a refusal in words.
 */

function refused(message: string | undefined): ActionOutcome {
  return { ok: false, message: message ?? 'That could not be saved.' };
}

/** The board and every page that shows a ripple re-read. */
function revalidate(): void {
  revalidatePath('/', 'layout');
}

// The pool it is left in (0053): the pool shown, or none for the owner on Home.
const Pool = z.uuid().nullable().default(null);

const Reaction = z.object({
  rippleId: z.uuid(),
  poolId: Pool,
  emoji: z.string().refine(isOneEmoji, 'One emoji.'),
  on: z.boolean(),
});

/** A chip tapped: my reaction with that emoji is added, or taken back. */
export async function setReaction(input: z.input<typeof Reaction>): Promise<ActionOutcome> {
  pushAfter();
  const parsed = Reaction.safeParse(input);
  if (!parsed.success) return refused('That is not one emoji.');
  const { rippleId, emoji, on, poolId } = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refused('Sign in again.');
  const { error } = on
    ? await supabase
        .from('ripple_reactions')
        .upsert(
          { ripple_id: rippleId, user_id: user.id, emoji, thread_pool_id: poolId },
          { onConflict: 'ripple_id,user_id,emoji', ignoreDuplicates: true },
        )
    : await supabase
        .from('ripple_reactions')
        .delete()
        .match({ ripple_id: rippleId, user_id: user.id, emoji });
  if (error)
    return refused(error.code === '42501' ? 'You can’t react to this ripple.' : error.message);
  revalidate();
  return { ok: true };
}

const Body = z.string().trim().min(1, 'Write something first.').max(REPLY_MAX);

const NewReply = z.object({ id: z.uuid(), rippleId: z.uuid(), body: Body, poolId: Pool });

/** A reply, its id minted in the browser so the one on screen is the real one. */
export async function addReply(input: z.input<typeof NewReply>): Promise<ActionOutcome> {
  pushAfter();
  const parsed = NewReply.safeParse(input);
  if (!parsed.success) return refused(parsed.error.issues[0]?.message);
  const supabase = await createClient();
  const { error } = await supabase.rpc('add_reply', {
    p_ripple: parsed.data.rippleId,
    p_body: parsed.data.body,
    p_id: parsed.data.id,
    p_pool: parsed.data.poolId as string,
  });
  if (error) return refused(error.message);
  revalidate();
  return { ok: true };
}

const Edit = z.object({ id: z.uuid(), body: Body });

export async function editReply(input: z.input<typeof Edit>): Promise<ActionOutcome> {
  const parsed = Edit.safeParse(input);
  if (!parsed.success) return refused(parsed.error.issues[0]?.message);
  const supabase = await createClient();
  const { error } = await supabase.rpc('edit_reply', {
    p_reply: parsed.data.id,
    p_body: parsed.data.body,
  });
  if (error) return refused(error.message);
  revalidate();
  return { ok: true };
}

/** Hard delete (0030): one's own reply, gone. */
export async function deleteReply(id: string): Promise<ActionOutcome> {
  if (!z.uuid().safeParse(id).success) return refused(undefined);
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_reply', { p_reply: id });
  if (error) return refused(error.message);
  revalidate();
  return { ok: true };
}

/** The ripple's author hides a reply on it, or shows it again. */
export async function hideReply(id: string, hidden: boolean): Promise<ActionOutcome> {
  if (!z.uuid().safeParse(id).success) return refused(undefined);
  const supabase = await createClient();
  const { error } = await supabase.rpc('hide_reply', { p_reply: id, p_hidden: hidden });
  if (error) return refused(error.message);
  revalidate();
  return { ok: true };
}
