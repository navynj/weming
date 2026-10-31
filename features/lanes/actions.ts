'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/queries/profile';

/** `id` is the lane written: the new one's, so a caller can link it at once (H23). */
export type LaneResult = { ok: true; id?: string } | { ok: false; message: string };

const Lane = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(24),
  /** One glyph. An emoji is the single allowed off-palette element (H4). */
  icon: z.string().trim().min(1).max(8),
});

export type Lane = z.infer<typeof Lane>;

/** Creates a lane, or renames and re-icons an existing one. */
export async function saveLane(input: Lane): Promise<LaneResult> {
  const parsed = Lane.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'A lane needs a name and an icon.' };
  const lane = parsed.data;

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false, message: 'Sign in again to change this.' };

  if (lane.id) {
    const { error } = await supabase
      .from('my_categories')
      .update({ name: lane.name, icon: lane.icon })
      .eq('id', lane.id);
    if (error) return { ok: false, message: error.message };
  } else {
    // Appended, because the order is the author's and a new lane has not
    // earned a place among the ones they already use.
    const { data: last } = await supabase
      .from('my_categories')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: made, error } = await supabase
      .from('my_categories')
      .insert({
        user_id: user.id,
        name: lane.name,
        icon: lane.icon,
        position: (last?.position ?? -1) + 1,
      })
      .select('id')
      .single();
    if (error) return { ok: false, message: error.message };
    revalidatePath('/lanes');
    revalidatePath('/');
    return { ok: true, id: made.id };
  }

  revalidatePath('/lanes');
  revalidatePath('/');
  return { ok: true, id: lane.id };
}

/**
 * Puts the lanes in the order given: the author's order, written as each
 * lane's position. Ids not mine are refused by RLS; ids left out keep
 * their old positions, which is harmless because the sheet always sends
 * every lane.
 */
export async function reorderLanes(ids: string[]): Promise<LaneResult> {
  const parsed = z.array(z.uuid()).min(1).max(64).safeParse(ids);
  if (!parsed.success) return { ok: false, message: 'That order is not a list of lanes.' };

  const supabase = await createClient();
  for (const [position, id] of parsed.data.entries()) {
    const { error } = await supabase.from('my_categories').update({ position }).eq('id', id);
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath('/');
  return { ok: true };
}

/**
 * Deletes a lane, but only while it is empty.
 *
 * A lane with records in it cannot be removed without deciding what happens to
 * them, and every answer is worse than refusing: deleting them loses records
 * to a bookkeeping action, and moving them rewrites what the author said
 * happened. So the refusal names the count and stops there.
 */
export async function deleteLane(id: string): Promise<LaneResult> {
  const supabase = await createClient();

  // A lane holds posts (H24): its blocks take it from them.
  const { count, error: countError } = await supabase
    .from('splashes')
    .select('id', { count: 'exact', head: true })
    .eq('declared_lane_id', id);
  if (countError) return { ok: false, message: countError.message };

  if (count && count > 0) {
    return {
      ok: false,
      message: `This lane holds ${count} post${count === 1 ? '' : 's'}, so it stays.`,
    };
  }

  const { error } = await supabase.from('my_categories').delete().eq('id', id);
  // A block written here before H24 still names it, frozen, until that
  // column goes (release 2): the database refuses, and so does the lane.
  if (error?.code === '23503') {
    return { ok: false, message: 'Records written in this lane still name it, so it stays.' };
  }
  if (error) return { ok: false, message: error.message };

  revalidatePath('/lanes');
  revalidatePath('/');
  return { ok: true };
}
