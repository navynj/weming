import { PoolSplash } from '@/features/pool/pool-splash';
import { SplashModal } from '@/features/splash/splash-modal';
import { idFromUrl } from '@/lib/routes';

/** A pool's splash opened from inside the app: its sheet over the current screen (review). */
export default async function PoolSplashSheet({
  params,
  searchParams,
}: PageProps<'/pool/[id]/splash/[sid]'>) {
  const { id: poolParam, sid: splashParam } = await params;
  const id = idFromUrl(poolParam);
  const sid = idFromUrl(splashParam);
  // `?write=1`: opened to add my side, the next block's editor already up (Board view).
  const { write } = await searchParams;
  return (
    <SplashModal closeTo={null}>
      <PoolSplash id={id} sid={sid} writing={write === '1'} />
    </SplashModal>
  );
}
