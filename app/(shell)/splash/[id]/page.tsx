import { HomeScreen } from '@/features/home/home-screen';
import { HomeSplash } from '@/features/splash/home-splash';
import { SplashModal } from '@/features/splash/splash-modal';
import { WELCOME } from '@/features/notifications/welcome';

/**
 * A splash's own URL, visited directly (a shared link, a reload): its sheet
 * over Home, with the post on top of the stack; closing it leaves Home. From
 * inside the app the same URL opens as a sheet over the current screen
 * instead (@modal/(.)splash).
 */
export default async function SplashRoute({ params, searchParams }: PageProps<'/splash/[id]'>) {
  const { id } = await params;
  // A first sign-in's welcome splash (H58): Home after it greets with the notifications card.
  const welcome = (await searchParams)[WELCOME] !== undefined ? `&${WELCOME}=1` : '';
  return (
    <>
      <HomeScreen top={id} />
      <SplashModal closeTo={`/?top=${id}${welcome}`}>
        <HomeSplash id={id} />
      </SplashModal>
    </>
  );
}
