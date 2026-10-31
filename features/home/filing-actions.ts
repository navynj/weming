'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/queries/profile';

/**
 * Home filing (H45, 0060): where a record that is not in one of my lanes
 * shows on my Home — one of my lanes, or back to its pool's column (null).
 * Display only and mine alone: nothing about the record, its pools or its
 * audience changes, and no one else reads it.
 */
export async function fileOnHome(
  splashId: string,
  laneId: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = z
    .object({ splashId: z.uuid(), laneId: z.uuid().nullable() })
    .safeParse({ splashId, laneId });
  if (!parsed.success) return { ok: false, message: 'That didn’t save. Try again.' };
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false, message: 'Sign in again to change this.' };

  // Moved among my lanes, else filed anew: an upsert would write every
  // column, and only the lane is mine to update (0060).
  let error: { message: string } | null = null;
  if (laneId) {
    const moved = await supabase
      .from('home_filing')
      .update({ my_lane_id: laneId })
      .eq('user_id', user.id)
      .eq('splash_id', splashId)
      .select('splash_id');
    error = moved.error;
    if (!error && (moved.data ?? []).length === 0) {
      ({ error } = await supabase
        .from('home_filing')
        .insert({ user_id: user.id, splash_id: splashId, my_lane_id: laneId }));
    }
  } else {
    ({ error } = await supabase
      .from('home_filing')
      .delete()
      .eq('user_id', user.id)
      .eq('splash_id', splashId));
  }
  if (error) return { ok: false, message: 'That didn’t save. Try again.' };
  revalidatePath('/');
  revalidatePath('/lane/[id]', 'page');
  return { ok: true };
}
