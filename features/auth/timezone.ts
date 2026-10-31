'use server';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/queries/profile';
import { isTimeZone } from '@/lib/time';

/**
 * Keeps my profile's zone where I am (0013): a new record's day is cut in
 * it when written. Moving it moves nothing already written — each row's
 * `written_on` is fixed at insert.
 */
export async function updateMyTimezone(zone: string): Promise<{ ok: boolean }> {
  const parsed = z.string().min(1).max(64).safeParse(zone);
  if (!parsed.success || !isTimeZone(parsed.data)) return { ok: false };
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false };
  const { error } = await supabase
    .from('profiles')
    .update({ timezone: parsed.data })
    .eq('id', user.id);
  return { ok: !error };
}
