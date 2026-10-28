import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapProfile } from '@/features/auth/bootstrap-profile';
import { PRESET_CATEGORIES } from '@/features/auth/preset-categories';
import { asAdmin, asUser } from './as-user';

/**
 * First sign-in runs as the new user, not as a privileged service, so this
 * exercises the insert policies as well as the bootstrap itself.
 */

let created: string | null = null;

afterEach(async () => {
  if (created) await asAdmin().auth.admin.deleteUser(created);
  created = null;
});

async function newAccount(): Promise<string> {
  const { data, error } = await asAdmin().auth.admin.createUser({
    email: `newcomer-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  created = data.user.id;
  return data.user.id;
}

describe('profile bootstrap', () => {
  it('creates the profile and seeds the preset categories', async () => {
    const userId = await newAccount();
    const supabase = asUser(userId);

    // True: this was the first sign-in, which the callback greets (review).
    await expect(
      bootstrapProfile(supabase, {
        userId,
        displayName: 'Newcomer',
        avatarUrl: null,
        timezone: 'Asia/Seoul',
      }),
    ).resolves.toBe(true);

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, timezone')
      .eq('id', userId)
      .single();

    expect(profile).toEqual({ display_name: 'Newcomer', timezone: 'Asia/Seoul' });

    const { data: categories } = await supabase
      .from('my_categories')
      .select('name, icon, default_mode')
      .order('position');

    expect(categories).toEqual(PRESET_CATEGORIES.map((preset) => ({ ...preset })));
  });

  it('is idempotent, so a re-entered callback is harmless', async () => {
    const userId = await newAccount();
    const supabase = asUser(userId);
    const input = {
      userId,
      displayName: 'Newcomer',
      avatarUrl: null,
      timezone: 'America/Vancouver',
    };

    await bootstrapProfile(supabase, input);
    await expect(bootstrapProfile(supabase, input)).resolves.toBe(false);

    const { count } = await supabase
      .from('my_categories')
      .select('*', { count: 'exact', head: true });

    expect(count).toBe(PRESET_CATEGORIES.length);
  });

  it('cannot create a profile for someone else', async () => {
    const userId = await newAccount();

    await expect(
      bootstrapProfile(asUser(userId), {
        userId: '11111111-1111-1111-1111-111111111111',
        displayName: 'Not Yoonji',
        avatarUrl: null,
        timezone: 'UTC',
      }),
    ).rejects.toThrow();
  });
});
