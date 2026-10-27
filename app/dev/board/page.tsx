import { notFound } from 'next/navigation';

import { BoardFixture } from './board-fixture';

export const metadata = { title: 'Board · fixture' };

/**
 * The Calendar on fixture records, for measuring direct manipulation in a
 * real browser (e2e/board-resize.spec.ts). Dev-only, like /dev/waves: it
 * reads and writes nothing, and a tab must never appear for it (D3).
 * `?tilt=20` turns every part by that many degrees.
 */
export default async function BoardFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { tilt } = await searchParams;
  const degrees = Number(Array.isArray(tilt) ? tilt[0] : (tilt ?? 0)) || 0;
  return <BoardFixture tilt={degrees} />;
}
