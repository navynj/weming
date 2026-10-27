import { describe, expect, it } from 'vitest';

import { defaultInnerTime } from '@/features/ripple-sheet/inner-slot';
import { parentBoundsMessage } from '@/features/ripple-sheet/end-rules';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import { written } from './written-on';

const TZ = 'America/Vancouver';

function session(over: Partial<RippleWithSplash> = {}): RippleWithSplash {
  return written({
    id: 'sess',
    author_id: 'a1',
    thread_pool_id: null,
    note: 'long afternoon',
    media: [],
    occurred_on: '2027-07-08',
    occurred_time: '09:00:00',
    // 09:00–11:00 in Vancouver (UTC-7 in July).
    started_at: '2027-07-08T16:00:00.000Z',
    ended_at: '2027-07-08T18:00:00.000Z',
    planned: false,
    participants: [],
    created_at: '2027-07-08T16:00:00.000Z',
    parent_ripple_id: null,
    splash_id: null,
    ...over,
  });
}

function child(from: string, to: string): RippleWithSplash {
  return session({ id: `c-${from}`, parent_ripple_id: 'sess', started_at: from, ended_at: to });
}

describe('where a retroactive inner ripple lands', () => {
  it('starts at the session start when nothing is inside yet', () => {
    expect(defaultInnerTime(session(), [], TZ)).toBe('09:00');
  });

  it('follows the last thing already inside it', () => {
    const existing = [child('2027-07-08T16:30:00.000Z', '2027-07-08T16:50:00.000Z')];
    expect(defaultInnerTime(session(), existing, TZ)).toBe('09:50');
  });

  it('falls back to the start rather than landing on the end', () => {
    // The span is half-open, so its final instant is not inside it.
    const existing = [child('2027-07-08T17:30:00.000Z', '2027-07-08T18:00:00.000Z')];
    expect(defaultInnerTime(session(), existing, TZ)).toBe('09:00');
  });

  it('reads the clock in the author zone, not the server zone', () => {
    expect(defaultInnerTime(session(), [], 'Asia/Seoul')).toBe('01:00');
  });

  it('has nowhere to go for a record with no span', () => {
    expect(defaultInnerTime(session({ started_at: null }), [], TZ)).toBeUndefined();
  });
});

describe('what a refused inner edit says', () => {
  it('names both bounds of a finished session', () => {
    expect(
      parentBoundsMessage({
        occurred_time: '09:00:00',
        ended_at: '2027-07-08T18:00:00.000Z',
        endWallClock: '11:00',
      }),
    ).toBe('That time is outside this session, which ran 09:00–11:00.');
  });

  it('names only the start of a session still running', () => {
    expect(
      parentBoundsMessage({ occurred_time: '09:00:00', ended_at: null, endWallClock: null }),
    ).toBe('That time is before this session, which started at 09:00.');
  });

  it('stays general when the parent has no clock at all', () => {
    expect(parentBoundsMessage({ occurred_time: null, ended_at: null, endWallClock: null })).toBe(
      'That time falls outside the session this record sits in.',
    );
  });
});
