'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { GroundFoot } from '@/features/home/ground-foot';
import { useInputSheet } from '@/features/input-sheet/sheet-provider';
import { poolPath } from '@/lib/routes';

import { lastPool } from './remembered';

/**
 * The Pool tab (H23): my most recently viewed pool on this device, else the
 * pool I joined last. Only with no pool at all is there a page here — the
 * invitation to open one.
 */
export function PoolIndex({ poolIds }: { poolIds: string[] }) {
  const router = useRouter();
  const { openSheet } = useInputSheet();
  useEffect(() => {
    if (poolIds.length === 0) return;
    const remembered = lastPool();
    router.replace(poolPath(remembered && poolIds.includes(remembered) ? remembered : poolIds[0]));
  }, [poolIds, router]);

  return (
    <main className="water-ground flex h-dvh min-h-0 flex-col lg:flex-row">
      <div
        className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {poolIds.length === 0 ? (
          <div data-no-pool className="flex flex-1 flex-col justify-center gap-6 px-8 text-white">
            <h1 className="text-3xl/tight font-semibold">No Pool yet</h1>
            <p className="text-sm/relaxed text-white/80">
              A Pool is a space for the people you keep records with. Only the lanes you connect
              flow into it; everything else stays yours.
            </p>
            <Link
              href="/pool/new"
              data-open-new-pool
              className="text-main-900 flex h-14 items-center justify-center rounded-full bg-white font-semibold"
            >
              Open a new Pool
            </Link>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <GroundFoot here="pool" onCompose={() => openSheet()} />
      </div>
      <GroundFoot slot="wide" here="pool" onCompose={() => openSheet()} />
    </main>
  );
}
