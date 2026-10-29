import { HomeScreen } from '@/features/home/home-screen';
import { HomeSplash } from '@/features/splash/home-splash';
import { SplashModal } from '@/features/splash/splash-modal';
import { idFromUrl } from '@/lib/routes';

/**
 * A splash's own URL, visited directly (a shared link, a reload): its sheet
 * over Home, with the post on top of the stack; closing it leaves Home. From
 * inside the app the same URL opens as a sheet over the current screen
 * instead (@modal/(.)splash).
 */
export default async function SplashRoute({ params }: PageProps<'/splash/[id]'>) {
  const id = idFromUrl((await params).id);
  return (
    <>
      <HomeScreen top={id} />
      <SplashModal closeTo={`/?top=${id}`}>
        <HomeSplash id={id} />
      </SplashModal>
    </>
  );
}
