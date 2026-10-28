import { HomeScreen } from '@/features/home/home-screen';

/** Home (SPEC 5, H22); the screen itself is HomeScreen, which a splash's own URL also draws under its sheet. */
export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const params = await searchParams;
  const one = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;
  return (
    <HomeScreen
      m={one(params.m)}
      top={one(params.top)}
      manage={one(params.manage)}
      view={one(params.view)}
      welcome={params.welcome !== undefined}
    />
  );
}
