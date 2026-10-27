import { SheetHost } from '@/features/input-sheet/sheet-host';
import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { TimezoneSync } from '@/features/auth/timezone-sync';
import { initialsOf } from '@/features/home/grid';
import { PeopleProvider } from '@/features/people/people-provider';
import { PoolActivityProvider } from '@/features/pool/activity';
import { getPeople } from '@/lib/queries/people';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { getMyLinks, getMyPoolNames, getPoolActivity } from '@/lib/queries/pools';
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
  // just renders around it.
  const context = profile
    ? {
        categories: await getMyCategories(supabase),
        timeZone: profile.timezone,
        today: todayIn(profile.timezone),
        // The Audience chip's defaults and rows (H23).
        links: await getMyLinks(supabase, profile.id),
        pools: await getMyPoolNames(supabase, profile.id),
        initials: initialsOf(profile.display_name),
      }
    : null;
  // Every face the shell draws, signed once here (0018).
  const people = profile ? await getPeople(supabase) : {};
  // What is new in each pool, for the Pool tab's dot (review).
  const latest = context
    ? await getPoolActivity(
        supabase,
        profile!.id,
        context.pools.map((p) => p.id),
      )
    : new Map<string, string>();
  // Each pool's photo for the strip (0024), signed once here.
  const poolPhotos = context
    ? await signPoolPhotos(
        supabase,
        context.pools.map((p) => ({ id: p.id, version: p.photoVersion })),
      )
    : {};
  const stripPools = (context?.pools ?? []).map((p) => ({
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
        <InputSheetProvider>
          <div className="flex min-h-dvh flex-col">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
          </div>
          {/* A splash opened from inside the app: a sheet over the screen (review). */}
          {modal}
          {context ? <SheetHost context={context} /> : null}
          {profile ? <TimezoneSync profileZone={profile.timezone} /> : null}
        </InputSheetProvider>
      </PoolActivityProvider>
    </PeopleProvider>
  );
}
