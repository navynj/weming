import { summarizeAll, type Splash, type SplashSummary } from '@/features/splash/summary';
import type { DuringClient } from '@/lib/queries/profile';
import type { RippleWithSplash } from '@/lib/queries/ripples';

/** My posts. RLS makes them mine; the filter makes the intent legible. */
export async function getMySplashes(supabase: DuringClient, ownerId: string): Promise<Splash[]> {
  const { data, error } = await supabase
    .from('splashes')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/** Every post summarised against its blocks, splashless blocks included, recent first. */
export function summarizeSplashes(
  splashes: Splash[],
  ripples: RippleWithSplash[],
  timeZone: string,
  now: Date,
): SplashSummary[] {
  return summarizeAll(splashes, ripples, timeZone, now);
}
