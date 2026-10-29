import { PoolScreen } from '@/features/pool/pool-screen';
import { idFromUrl } from '@/lib/routes';

/** A pool's home (H23); the screen itself is PoolScreen, which a pool splash's URL also draws under its sheet. */
export default async function PoolPage({ params, searchParams }: PageProps<'/pool/[id]'>) {
  const id = idFromUrl((await params).id);
  const { top, view, welcome } = await searchParams;
  return (
    <PoolScreen
      id={id}
      top={typeof top === 'string' ? top : undefined}
      view={typeof view === 'string' ? view : undefined}
      welcome={welcome !== undefined}
    />
  );
}
