import { PoolScreen } from '@/features/pool/pool-screen';
import { PoolSplash } from '@/features/pool/pool-splash';
import { SplashModal } from '@/features/splash/splash-modal';

/**
 * A pool's splash, visited directly: its sheet over that pool, with the post
 * on top of the stack; closing it leaves the pool. From inside the app the
 * same URL opens as a sheet over the current screen (@modal/(.)pool).
 */
export default async function PoolSplashRoute({
  params,
  searchParams,
}: PageProps<'/pool/[id]/splash/[sid]'>) {
  const { id, sid } = await params;
  // `?write=1`: opened to add my side, the next block's editor already up (Board view).
  const { write } = await searchParams;
  return (
    <>
      <PoolScreen id={id} top={sid} />
      <SplashModal closeTo={`/pool/${id}?top=${sid}`}>
        <PoolSplash id={id} sid={sid} writing={write === '1'} />
      </SplashModal>
    </>
  );
}
