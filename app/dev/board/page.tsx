import { notFound } from 'next/navigation';

import { BoardFixture, type Scene } from './board-fixture';

export const metadata = { title: 'Board · fixture' };

/**
 * The Calendar on fixture records, for measuring direct manipulation in a
 * real browser (e2e/board-resize.spec.ts). Dev-only, like /dev/waves: it
 * reads and writes nothing, and a tab must never appear for it (D3).
 * `?tilt=20` turns every part by that many degrees; `?scene=layers` or
 * `?scene=captions` sets other records out, and `?moved=1` moves one by hand.
 */
export default async function BoardFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const degrees = Number(one('tilt') ?? 0) || 0;
  const scene: Scene =
    one('scene') === 'layers' ? 'layers' : one('scene') === 'captions' ? 'captions' : 'resize';
  return <BoardFixture tilt={degrees} scene={scene} moved={one('moved') === '1'} />;
}
