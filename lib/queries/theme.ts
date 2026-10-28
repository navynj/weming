import { cache } from 'react';

import {
  asTheme,
  asThemeColor,
  asThemeMode,
  DEFAULT_THEME,
  type MyTheme,
  type PoolColors,
} from '@/lib/theme';
import { getAuthUser, getMyProfile, type DuringClient } from '@/lib/queries/profile';

/**
 * My theme (0059): my Home colour, my mode, whether my colour applies in
 * every pool — from my own settings, which nobody else reads; before I
 * have a row, what my profile held (0032), then the app's.
 */
export const getMyTheme = cache(async (supabase: DuringClient): Promise<MyTheme> => {
  const user = await getAuthUser(supabase);
  if (!user) return { home: DEFAULT_THEME.color, mode: DEFAULT_THEME.mode, everywhere: false };
  const { data } = await supabase
    .from('my_theme_settings')
    .select('home_color, mode, apply_everywhere')
    .eq('user_id', user.id)
    .maybeSingle();
  if (data) {
    const theme = asTheme(data.home_color, data.mode);
    return { home: theme.color, mode: theme.mode, everywhere: data.apply_everywhere };
  }
  const profile = await getMyProfile(supabase);
  const theme = profile ? asTheme(profile.theme_color, profile.theme_mode) : DEFAULT_THEME;
  return { home: theme.color, mode: theme.mode, everywhere: false };
});

/** A pool's colour and mine there (0059), each with its mode (0062). */
export async function getPoolColors(
  supabase: DuringClient,
  poolId: string,
  me: string,
): Promise<PoolColors> {
  const [pool, mine] = await Promise.all([
    supabase.from('pools').select('theme, theme_mode').eq('id', poolId).maybeSingle(),
    supabase
      .from('member_pool_settings')
      .select('theme, theme_mode')
      .eq('pool_id', poolId)
      .eq('user_id', me)
      .maybeSingle(),
  ]);
  return {
    pool: asThemeColor(pool.data?.theme),
    mine: asThemeColor(mine.data?.theme),
    poolMode: asThemeMode(pool.data?.theme_mode),
    mineMode: asThemeMode(mine.data?.theme_mode),
  };
}
