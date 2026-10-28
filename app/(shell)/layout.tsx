import { SheetHost } from '@/features/input-sheet/sheet-host';
import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { ShellDataProvider } from '@/features/home/shell-data';
import { TimezoneSync } from '@/features/auth/timezone-sync';
import { initialsOf } from '@/features/home/grid';
import { PeopleProvider } from '@/features/people/people-provider';
import { PoolActivityProvider } from '@/features/pool/activity';
import { NotificationsProvider } from '@/features/notifications/notifications-provider';
import { SplashOpeningHost, SplashOpeningProvider } from '@/features/splash/splash-opening';
import { getPeople } from '@/lib/queries/people';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { getMyPoolNames, getPoolActivity } from '@/lib/queries/pools';
import { getUnreadCount } from '@/lib/queries/notifications';
import { createClient } from '@/lib/supabase/server';
import { todayIn } from '@/lib/time';
import { signPoolPhotos } from '@/lib/avatars';

/**
 * The shell: the page and the composer, a bottom sheet from the compose
 * disc at every width (review: the wide screen's standing composer
 * retired; its right half is the board's). Each page lays out its own
 * column, because Home's ground is full-bleed and the white pages are not.
 * The composer needs the lanes only: sessions are date-based, so it has no
 * session field.
 */
export default async function ShellLayout({ children, modal }: LayoutProps<'/'>) {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);

  // A page without a profile redirects to sign-in on its own, so the shell
  // just renders around it. Everything needing only the profile is read in
  // one wave, and what needs the pools in the next (review: round trips).
  const [categories, pools, people, unread] = profile
    ? await Promise.all([
        getMyCategories(supabase),
        getMyPoolNames(supabase, profile.id),
        // Every face the shell draws, signed once here (0018).
        getPeople(supabase),
        // The bell's dot (H32); a failed count is no dot, never a broken shell.
        getUnreadCount(supabase).catch(() => 0),
      ])
    : [[], [], {}, 0];
  const context = profile
    ? {
        categories,
        timeZone: profile.timezone,
        today: todayIn(profile.timezone),
        pools,
        initials: initialsOf(profile.display_name),
      }
    : null;
  const [latest, poolPhotos] = context
    ? await Promise.all([
        // What is new in each pool, for the Pool tab's dot (review).
        getPoolActivity(
          supabase,
          profile!.id,
          pools.map((p) => p.id),
        ),
        // Each pool's photo for the strip (0024), signed once here.
        signPoolPhotos(
          supabase,
          pools.map((p) => ({ id: p.id, version: p.photoVersion })),
        ),
      ])
    : [new Map<string, string>(), {} as Record<string, string | null>];
  const stripPools = pools.map((p) => ({
    id: p.id,
    name: p.name,
    photo: poolPhotos[p.id] ?? null,
  }));
  const activity: Record<string, string | null> = Object.fromEntries(
    (context?.pools ?? []).map((p) => [p.id, latest.get(p.id) ?? null]),
  );
  return (
    <PeopleProvider me={profile?.id ?? null} people={people}>
      <PoolActivityProvider activity={activity} pools={stripPools}>
        <SplashOpeningProvider>
          <NotificationsProvider initialUnread={unread}>
            <InputSheetProvider>
              <ShellDataProvider value={{ categories }}>
                <div className="flex min-h-dvh flex-col">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
                </div>
                {/* A splash opened from inside the app: a sheet over the screen (review). */}
                {modal}
                {/* A record opened from a notification, before its page lands. */}
                <SplashOpeningHost />
                {context ? <SheetHost context={context} /> : null}
                {profile ? <TimezoneSync profileZone={profile.timezone} /> : null}
              </ShellDataProvider>
            </InputSheetProvider>
          </NotificationsProvider>
        </SplashOpeningProvider>
      </PoolActivityProvider>
    </PeopleProvider>
  );
}
