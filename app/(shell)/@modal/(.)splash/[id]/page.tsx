import { HomeSplash } from '@/features/splash/home-splash';
import { SplashModal } from '@/features/splash/splash-modal';
import { idFromUrl } from '@/lib/routes';

/** A splash opened from inside the app: its sheet over the current screen; back closes it (review). */
export default async function SplashSheet({ params }: PageProps<'/splash/[id]'>) {
  const id = idFromUrl((await params).id);
  return (
    <SplashModal closeTo={null}>
      <HomeSplash id={id} />
    </SplashModal>
  );
}
