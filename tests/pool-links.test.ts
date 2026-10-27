import { describe, expect, it } from 'vitest';

import {
  defaultAudience,
  preselectLane,
  withPick,
  type AudienceLink,
} from '@/features/pool/audience';
import { defaultLink, homeLaneFor, type MarkedLink } from '@/features/pool/links';
import { landingHint, resolvePick } from '@/features/pool/pool-pick';

/** My Games lane linked to the pool's Games lane, with whichever markers a case needs. */
const link = (over: Partial<AudienceLink> = {}): AudienceLink => ({
  myCategoryId: 'my-games',
  poolLaneId: 'pl-games',
  poolId: 'p',
  poolName: 'Our Pool',
  isDefault: true,
  shareByDefault: false,
  isHome: false,
  ...over,
});

describe('the home lane (0033)', () => {
  it('shows a pool lane in my lane only when I marked it Home', () => {
    expect(homeLaneFor('pl-games', [link({ isHome: true })])).toBe('my-games');
    expect(homeLaneFor('pl-games', [link()])).toBeNull();
  });

  it('leaves another pool lane, no link, or no pool lane in the pool’s column', () => {
    expect(homeLaneFor('pl-other', [link({ isHome: true })])).toBeNull();
    expect(homeLaneFor('pl-games', [])).toBeNull();
    expect(homeLaneFor(null, [link({ isHome: true })])).toBeNull();
  });

  it('picks the marked one among several links of the same pool lane', () => {
    const links: MarkedLink[] = [
      { myCategoryId: 'my-a', poolLaneId: 'pl-games' },
      { myCategoryId: 'my-b', poolLaneId: 'pl-games', isHome: true },
    ];
    expect(homeLaneFor('pl-games', links)).toBe('my-b');
  });
});

describe('the default pool lane (0033)', () => {
  it('is the default row for (my lane, pool)', () => {
    const links = [
      link({ poolLaneId: 'pl-a', isDefault: false }),
      link({ poolLaneId: 'pl-b', isDefault: true }),
    ];
    expect(defaultLink('my-games', 'p', links)?.poolLaneId).toBe('pl-b');
  });

  it('is none for another lane, another pool, or no lane', () => {
    const links = [link()];
    expect(defaultLink('my-day', 'p', links)).toBeNull();
    expect(defaultLink('my-games', 'q', links)).toBeNull();
    expect(defaultLink(null, 'p', links)).toBeNull();
  });
});

describe('the Audience default from Home (0033)', () => {
  it('is Only me unless the lane’s default link shares by default', () => {
    expect(defaultAudience('my-games', [link()])).toEqual([]);
    expect(defaultAudience('my-games', [link({ shareByDefault: true })])).toEqual([
      { poolId: 'p', poolLaneId: 'pl-games' },
    ]);
  });

  it('never shares from a row that is not the default', () => {
    expect(defaultAudience('my-games', [link({ isDefault: false, shareByDefault: true })])).toEqual(
      [],
    );
  });

  it('is Only me for another lane, or none', () => {
    const links = [link({ shareByDefault: true })];
    expect(defaultAudience('my-day', links)).toEqual([]);
    expect(defaultAudience(null, links)).toEqual([]);
  });

  it('shares to every pool whose default row shares', () => {
    const links = [
      link({ shareByDefault: true }),
      link({ poolId: 'q', poolName: 'Crew', poolLaneId: 'ql', shareByDefault: true }),
      link({ poolId: 'r', poolName: 'Study', poolLaneId: 'rl' }),
    ];
    expect(defaultAudience('my-games', links)).toEqual([
      { poolId: 'p', poolLaneId: 'pl-games' },
      { poolId: 'q', poolLaneId: 'ql' },
    ]);
  });
});

describe('the chip a pool starts on in Audience (0033)', () => {
  const lanes = ['pl-games', 'pl-notes'];

  it('takes the link’s default pool lane first, even without sharing by default', () => {
    expect(preselectLane('my-games', 'p', [link()], 'pl-notes', lanes)).toBe('pl-games');
  });

  it('then the lane last picked on this device', () => {
    expect(preselectLane('my-games', 'p', [], 'pl-notes', lanes)).toBe('pl-notes');
    expect(preselectLane('my-games', 'p', [link({ isDefault: false })], 'pl-notes', lanes)).toBe(
      'pl-notes',
    );
  });

  it('then none: one must be picked', () => {
    expect(preselectLane('my-games', 'p', [], null, lanes)).toBeNull();
    expect(preselectLane(null, 'p', [link()], null, lanes)).toBeNull();
  });

  it('only ever a lane of that pool', () => {
    // The link's lane is gone from the pool, so the last pick fills in.
    expect(preselectLane('my-games', 'p', [link()], 'pl-notes', ['pl-notes'])).toBe('pl-notes');
    // A last pick from elsewhere is not this pool's.
    expect(preselectLane('my-games', 'p', [], 'ql', lanes)).toBeNull();
    // Another pool's default does not count here.
    expect(preselectLane('my-games', 'q', [link()], null, lanes)).toBeNull();
  });
});

describe('switching a pool in Audience (0033)', () => {
  const start = [
    { poolId: 'p', poolLaneId: 'pl-games' },
    { poolId: 'q', poolLaneId: 'ql' },
  ];

  it('turns a pool on at a lane, keeping the others', () => {
    expect(withPick([], 'p', 'pl-games')).toEqual([{ poolId: 'p', poolLaneId: 'pl-games' }]);
    expect(withPick(start, 'r', 'rl')).toEqual([...start, { poolId: 'r', poolLaneId: 'rl' }]);
  });

  it('moves a pool to another of its lanes, once', () => {
    expect(withPick(start, 'p', 'pl-notes')).toEqual([
      { poolId: 'q', poolLaneId: 'ql' },
      { poolId: 'p', poolLaneId: 'pl-notes' },
    ]);
  });

  it('turns a pool off', () => {
    expect(withPick(start, 'p', null)).toEqual([{ poolId: 'q', poolLaneId: 'ql' }]);
    expect(withPick(start, 'z', null)).toEqual(start);
  });
});

describe('where a pick from a pool lands (0033)', () => {
  it('is my pool record with nobody together, joint with anyone or Everyone', () => {
    expect(resolvePick('pl-games', [])).toEqual({ kind: 'own', poolLaneId: 'pl-games' });
    expect(resolvePick('pl-games', ['mina'])).toEqual({ kind: 'joint', poolLaneId: 'pl-games' });
    expect(resolvePick('pl-games', [], true)).toEqual({ kind: 'joint', poolLaneId: 'pl-games' });
  });

  it('says so with no word "lane"', () => {
    expect(landingHint('Our Pool', [])).toBe('Yours · in Our Pool');
    expect(landingHint('Our Pool', ['Mina', 'Jae'])).toBe('Together with Mina, Jae');
    expect(landingHint('Our Pool', [], true)).toBe('Together with everyone');
  });
});
