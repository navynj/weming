import { beforeEach, describe, expect, it, vi } from 'vitest';

// The 2026-10-28 edit on a pool's page: its update was cut off at the
// deadline, the author was shown "TimeoutError: …", and Sentry got it twice.

const captured = vi.hoisted(() => [] as Error[]);
vi.mock('@sentry/nextjs', () => ({
  captureException: (error: Error) => captured.push(error),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/notifications/after', () => ({ pushAfter: () => undefined }));

const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));
const CUT_OFF = { message: 'TimeoutError: The operation was aborted due to timeout' };
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      let writing = false;
      const chain = {
        update: () => ((writing = true), chain),
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: null, error: CUT_OFF }),
        maybeSingle: async () => ({ data: writing ? null : db.row, error: null }),
      };
      return chain;
    },
  }),
}));

import { saveSplashEdit } from '@/features/splash-sheet/edit-actions';
import { saveHeader } from '@/features/splash/header';
import { UNCONFIRMED } from '@/lib/supabase/fetch';

const ID = '5de3cf00-d146-4f81-aa16-a0511460d981';
const HEADER = {
  title: 'Swim',
  icon: null,
  declaredStart: '2026-10-28',
  declaredEnd: null,
  declaredLaneId: null,
};
const ROW = {
  id: ID,
  title: 'Swim',
  icon: null,
  declared_start: '2026-10-28',
  declared_end: null,
  declared_lane_id: null,
};

beforeEach(() => {
  captured.length = 0;
  db.row = null;
});

describe('a header update cut off at the deadline', () => {
  it('is saved when the row, read back, already holds it', async () => {
    db.row = ROW;
    expect(await saveHeader(ID, HEADER)).toEqual({ ok: true, splash: ROW });
  });

  it('says it could not confirm when the row does not, never the raw error', async () => {
    db.row = { ...ROW, title: 'Before' };
    expect(await saveHeader(ID, HEADER)).toEqual({ ok: false, message: UNCONFIRMED });
  });

  it('reaches Sentry once from the edit sheet, not again from the header inside it', async () => {
    const result = await saveSplashEdit({
      id: ID,
      kind: 'own',
      poolId: null,
      poolLaneId: null,
      share: [],
      ...HEADER,
    });
    expect(result).toEqual({ ok: false, message: UNCONFIRMED });
    expect(captured.map((e) => e.message)).toEqual([`edit failed: ${UNCONFIRMED}`]);
  });
});
