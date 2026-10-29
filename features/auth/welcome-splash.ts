import type { DuringClient } from '@/lib/queries/profile';
import { reportFailure } from '@/lib/report-failure';
import { APP_ASSET_PREFIX } from '@/lib/ripple-media';
import { todayIn } from '@/lib/time';

/** The welcome splash's words, icon and photo (H58). */
export const WELCOME_SPLASH = {
  title: 'Drop Your Splash',
  icon: '🌊',
  note: "What's your today? Leave a ripple.",
  // public/welcome/shell.png: one copy shipped with the app, never uploaded per account.
  photo: `${APP_ASSET_PREFIX}welcome/shell.png`,
} as const;

/**
 * A new account's first splash (H58): an ordinary splash of its own, on its
 * signup day in its own zone, with one block under it. Planted once per
 * account: the flag is claimed before anything is written, so two sign-ins
 * at once cannot plant two, and deleting the splash never brings it back.
 * A failure hands the flag back for the next sign-in to try, and never stops
 * the sign-in itself. The splash's id when it was planted now, else null.
 */
export async function plantWelcomeSplash(
  supabase: DuringClient,
  userId: string,
): Promise<string | null> {
  const { data: claimed, error: claimError } = await supabase
    .from('profiles')
    .update({ welcome_splash_created: true })
    .eq('id', userId)
    .eq('welcome_splash_created', false)
    .select('timezone')
    .maybeSingle();
  if (claimError) {
    reportFailure('compose', claimError);
    return null;
  }
  if (!claimed) return null;

  const id = await writeWelcome(supabase, userId, claimed.timezone);
  if (!id) {
    await supabase.from('profiles').update({ welcome_splash_created: false }).eq('id', userId);
  }
  return id;
}

async function writeWelcome(
  supabase: DuringClient,
  userId: string,
  timezone: string,
): Promise<string | null> {
  // The residual lane, as a drop with no lane takes (H20i).
  const { data: lanes } = await supabase.from('my_categories').select('id, name').order('position');
  const laneId = (lanes ?? []).find((c) => c.name === 'Day')?.id ?? lanes?.[0]?.id;
  if (!laneId) {
    reportFailure('compose', 'welcome splash: no lane');
    return null;
  }

  const { data: splash, error } = await supabase
    .from('splashes')
    .insert({
      owner_id: userId,
      title: WELCOME_SPLASH.title,
      icon: WELCOME_SPLASH.icon,
      declared_start: todayIn(timezone),
      declared_lane_id: laneId,
    })
    .select('id')
    .single();
  if (error) {
    reportFailure('compose', error);
    return null;
  }

  const { error: blockError } = await supabase.from('ripples').insert({
    author_id: userId,
    note: WELCOME_SPLASH.note,
    media: [WELCOME_SPLASH.photo],
    splash_id: splash.id,
  });
  if (blockError) {
    // Half a welcome is not the one promised: take the splash back with it.
    await supabase.from('splashes').delete().eq('id', splash.id);
    reportFailure('compose', blockError);
    return null;
  }
  return splash.id;
}
