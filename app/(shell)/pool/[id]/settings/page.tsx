import { redirect } from 'next/navigation';

/** Pool settings are a sheet over the pool now (0059): an old link opens it there. */
export default async function PoolSettingsPage({ params }: PageProps<'/pool/[id]/settings'>) {
  const { id } = await params;
  redirect(`/pool/${id}?settings=pool`);
}
