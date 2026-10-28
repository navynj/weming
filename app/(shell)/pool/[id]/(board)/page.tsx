import { PoolScreen } from '@/features/pool/pool-screen';

/** A pool's home (H23); the screen itself is PoolScreen, which a pool splash's URL also draws under its sheet. */
export default async function PoolPage({ params, searchParams }: PageProps<'/pool/[id]'>) {
  const { id } = await params;
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
