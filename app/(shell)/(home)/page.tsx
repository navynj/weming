import { redirect } from 'next/navigation';

import { HomeScreen } from '@/features/home/home-screen';

/** Home (SPEC 5, H22); the screen itself is HomeScreen, which a splash's own URL also draws under its sheet. */
export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const params = await searchParams;
  const one = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;
  // An old link to lane management opens the settings sheet's Home tab (0059).
  if (one(params.manage) === 'lanes') redirect('/?settings=home');
  return (
    <HomeScreen
      m={one(params.m)}
      top={one(params.top)}
      view={one(params.view)}
      welcome={params.welcome !== undefined}
    />
  );
}
