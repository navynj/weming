import type { DuringClient } from '@/lib/queries/profile';
import { PRESET_CATEGORIES } from '@/features/auth/preset-categories';

/**
 * First sign-in: create the profile row and seed the preset categories.
 * True when it made them now, so the callback can greet a first sign-in.
 *
 * Runs as the signed-in user, so RLS is doing the work — the insert policies
 * are what guarantee a profile can only ever be created for oneself. Both
 * writes are idempotent, so a re-entered callback is harmless.
 */
export async function bootstrapProfile(
  supabase: DuringClient,
  input: { userId: string; displayName: string; avatarUrl: string | null; timezone: string },
): Promise<boolean> {
  const { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', input.userId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing) return false;

  const { error: profileError } = await supabase.from('profiles').insert({
    id: input.userId,
    display_name: input.displayName,
    avatar_url: input.avatarUrl,
    timezone: input.timezone,
  });

  if (profileError) throw profileError;

  const { error: categoryError } = await supabase.from('my_categories').insert(
    PRESET_CATEGORIES.map((category, position) => ({
      user_id: input.userId,
      name: category.name,
      icon: category.icon,
      default_mode: category.default_mode,
      position,
    })),
  );

  if (categoryError) throw categoryError;
  return true;
}
