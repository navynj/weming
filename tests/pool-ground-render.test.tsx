// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushed: string[] = [];
const replaced: string[] = [];
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => '/pool/p-a',
  useRouter: () => ({
    push: (to: string) => pushed.push(to),
    replace: (to: string) => replaced.push(to),
    refresh: () => {},
    prefetch: () => {},
  }),
}));
vi.mock('@/features/splash/actions', () => ({
  setSplashPinned: () => Promise.resolve({ ok: true }),
  deleteSplash: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/features/pool/actions', () => ({
  deleteJointSplash: () => Promise.resolve({ ok: true }),
  leavePool: () => Promise.resolve({ ok: true }),
  savePoolLane: () => Promise.resolve({ ok: true }),
  createInvite: () => Promise.resolve({ ok: false, message: 'not in tests' }),
  revokeInvite: () => Promise.resolve({ ok: true }),
}));

import { InputSheetProvider, useInputSheet } from '@/features/input-sheet/sheet-provider';
import { PeopleProvider } from '@/features/people/people-provider';
import { PoolActivityProvider } from '@/features/pool/activity';
import type { PoolViewKind } from '@/features/pool/pool-cards';
import { PoolGround } from '@/features/pool/pool-ground';
import { PoolIndex } from '@/features/pool/pool-index';
import { lastPool, rememberVisit } from '@/features/pool/remembered';
import type { Splash } from '@/features/splash/summary';
import type { MyPool, PoolRipple, PoolView } from '@/lib/queries/pools';
import { written } from './written-on';

const TZ = 'America/Vancouver';
const ME = 'u-me';
const MINA = 'u-mina';
const GONE = 'u-gone';

function splash(over: Partial<Splash> & { id: string }): Splash {
  return written({
    owner_id: ME,
    title: '',
    declared_start: null,
    declared_end: null,
    declared_lane_id: null,
    icon: null,
    session_id: null,
    pinned_at: null,
    pool_id: null,
    pool_lane_id: null,
    own_pool_id: null,
    joint_invite_all: false,
    description: null,
    created_by: null,
    type: 'free',
    prompt: null,
    ends_at: null,
    created_at: '2026-10-20T18:00:00.000Z',
    ...over,
  });
}

function ripple(over: Partial<PoolRipple> & { id: string; splash_id: string }): PoolRipple {
  return written({
    author_id: ME,
    thread_pool_id: null,
    note: 'words',
    media: [],
    occurred_on: '2026-10-21',
    occurred_time: null,
    ended_at: null,
    created_at: '2026-10-21T18:00:00.000Z',
    started_at: null,
    ...over,
  });
}

const LANE = (id: string, pool: string, name: string, icon: string, position: number) => ({
  id,
  pool_id: pool,
  name,
  icon,
  description: null,
  position,
});

/** Pool A: two current members and one who left keeping theirs; a placed post each, and a joint splash with two ripples. */
const A: PoolView = {
  pool: { id: 'p-a', name: 'Our Pool', ownerId: ME },
  members: [
    {
      userId: ME,
      name: 'Yoonji Lee',
      initials: 'YL',
      joinedAt: '2026-10-01',
      former: false,
      timeZone: TZ,
    },
    {
      userId: MINA,
      name: 'Mina',
      initials: 'MI',
      joinedAt: '2026-10-02',
      former: false,
      timeZone: TZ,
    },
    {
      userId: GONE,
      name: 'Gone',
      initials: 'GO',
      joinedAt: '2026-10-03',
      former: true,
      timeZone: TZ,
    },
  ],
  lanes: [LANE('l-food', 'p-a', 'Food', '🍽️', 0), LANE('l-media', 'p-a', 'Media', '🎬', 1)],
  myLinks: [
    {
      poolLaneId: 'l-food',
      myCategoryId: 'my-lane',
      isDefault: true,
      shareByDefault: false,
      isHome: true,
    },
  ],
  placements: [
    { splashId: 's-mine', poolId: 'p-a', poolLaneId: 'l-food', shared: true, ownerId: ME },
    { splashId: 's-mina', poolId: 'p-a', poolLaneId: 'l-food', shared: true, ownerId: MINA },
    { splashId: 's-own', poolId: 'p-a', poolLaneId: 'l-media', shared: true, ownerId: ME },
  ],
  splashes: [
    // Each owns its date (H24): the day its ripples used to say.
    splash({ id: 's-mine', title: 'Fried egg', declared_start: '2026-10-22' }),
    splash({ id: 's-mina', owner_id: MINA, title: 'Hiking', declared_start: '2026-10-21' }),
    splash({ id: 's-own', own_pool_id: 'p-a', title: 'Just mine', declared_start: '2026-10-21' }),
    splash({
      id: 's-joint',
      owner_id: null,
      pool_id: 'p-a',
      pool_lane_id: 'l-media',
      created_by: MINA,
      title: 'Lost Ruins of Arnak',
      icon: '🏛️',
      declared_start: '2026-10-20',
    }),
  ],
  ripples: [
    ripple({ id: 'r-mine', splash_id: 's-mine', occurred_on: '2026-10-22' }),
    ripple({ id: 'r-mina', splash_id: 's-mina', author_id: MINA }),
    ripple({ id: 'r-own', splash_id: 's-own' }),
    ripple({ id: 'r-j1', splash_id: 's-joint', author_id: MINA, occurred_on: '2026-10-20' }),
    ripple({ id: 'r-j2', splash_id: 's-joint', author_id: ME, occurred_on: '2026-10-20' }),
  ],
  invites: [],
  // Mina made it with me: someone besides its maker is invited, so it is filled (0033).
  together: { 's-joint': [MINA, ME] },
};

/** Pool B: nothing of A's. */
const B: PoolView = {
  pool: { id: 'p-b', name: 'Study Crew', ownerId: ME },
  members: [
    {
      userId: ME,
      name: 'Yoonji Lee',
      initials: 'YL',
      joinedAt: '2026-10-05',
      former: false,
      timeZone: TZ,
    },
  ],
  lanes: [LANE('l-notes', 'p-b', 'Notes', '📓', 0)],
  myLinks: [],
  placements: [
    { splashId: 's-study', poolId: 'p-b', poolLaneId: 'l-notes', shared: true, ownerId: ME },
  ],
  splashes: [splash({ id: 's-study', title: 'Chapter 3' })],
  ripples: [ripple({ id: 'r-study', splash_id: 's-study' })],
  invites: [],
};

const POOLS: MyPool[] = [
  { id: 'p-a', name: 'Our Pool', members: [], latestActivity: null },
  {
    id: 'p-b',
    name: 'Study Crew',
    members: [],
    latestActivity: '2026-10-22T00:00:00Z',
  },
];

/** As the shell provides them: my pools and what is new in each (review). */
const ACTIVITY = Object.fromEntries(POOLS.map((p) => [p.id, p.latestActivity]));

function ground(view: PoolView) {
  return render(
    <PoolActivityProvider activity={ACTIVITY} pools={POOLS}>
      <InputSheetProvider>
        <PoolGround view={view} me={ME} today="2026-10-23" timeZone={TZ} initialView={startView} />
      </InputSheetProvider>
    </PoolActivityProvider>,
  );
}

/** The view a test's pool opens on: a visit opens on the Calendar (review); these choose. */
let startView: PoolViewKind = 'members';
function setView(view: 'lane' | 'date' | 'members' | 'board'): void {
  startView = view;
}

beforeEach(() => {
  window.localStorage.clear();
  // A visit opens on the Calendar (review); these read Members unless they choose.
  startView = 'members';
  window.sessionStorage.clear();
  Element.prototype.scrollTo = function scrollTo() {} as Element['scrollTo'];
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
  pushed.length = 0;
  replaced.length = 0;
});
afterEach(cleanup);

/** The joint splash with Everyone on (0033): a band across Members' members (review). */
const everyoneOn = (s: Splash): Splash =>
  s.id === 's-joint' ? { ...s, joint_invite_all: true } : s;
const EVERYONE: PoolView = { ...A, splashes: A.splashes.map(everyoneOn) };

describe('a joint splash on the grid (H23)', () => {
  it('with Everyone on, spans Members as one band, never also a piece (review)', () => {
    setView('members');
    const { container } = ground(EVERYONE);
    expect(container.querySelectorAll('[data-lane-band="s-joint"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-lane-piece="s-joint"]')).toHaveLength(0);
    // The icon and the title are the splash's, on its band.
    expect(container.querySelector('[data-lane-band="s-joint"]')!.textContent).toContain('🏛️');
  });

  it('with picked invitees too, is a band across Members, never a piece (review)', () => {
    setView('members');
    const { container } = ground(A);
    expect(container.querySelectorAll('[data-lane-band="s-joint"]')).toHaveLength(1);
    expect(container.querySelector('[data-lane-piece="s-joint"]')).toBeNull();
  });

  it('hangs "Add your side" from its band in my column while it waits for me', () => {
    setView('members');
    const waiting: PoolView = {
      ...A,
      // Mina wrote; I am picked and have not.
      ripples: A.ripples.filter((r) => r.id !== 'r-j2'),
      together: { 's-joint': [MINA, ME] },
    };
    // As the shell gives it: who I am.
    const { container } = render(
      <PeopleProvider me={ME} people={{}}>
        <PoolActivityProvider activity={ACTIVITY} pools={POOLS}>
          <InputSheetProvider>
            <PoolGround
              view={waiting}
              me={ME}
              today="2026-10-23"
              timeZone={TZ}
              initialView={startView}
            />
          </InputSheetProvider>
        </PoolActivityProvider>
      </PeopleProvider>,
    );
    const band = container.querySelector('[data-lane-band="s-joint"]')!;
    const slot = band.querySelector<HTMLElement>('[data-tape-slot="s-joint"]')!;
    expect(slot).not.toBeNull();
    expect(slot.textContent).toMatch(/Add/);
    // My column is the first (me first): it starts there.
    expect(parseFloat(slot.style.left)).toBeLessThan(20);
    cleanup();
    // Written already: no note.
    expect(ground(A).container.querySelector('[data-tape-slot]')).toBeNull();
  });
  it('shows who wrote on it on its band, each once, with no branches', () => {
    setView('members');
    const { container } = ground(EVERYONE);
    const band = container.querySelector('[data-lane-band="s-joint"]')!;
    expect(band.querySelector('[data-board-faces]')).not.toBeNull();
    // Mina and I: no "+n".
    expect(band.textContent).not.toMatch(/\+\d/);
    expect(container.querySelector('[data-branch]')).toBeNull();
  });
  it('shows four faces, then +n', () => {
    setView('members');
    const writers = ['u-1', 'u-2', 'u-3', 'u-4', 'u-5', 'u-6'];
    const crowded: PoolView = {
      ...EVERYONE,
      members: [
        ...EVERYONE.members,
        ...writers.map((userId, at) => ({
          userId,
          name: `P${at}`,
          initials: `P${at}`,
          joinedAt: `2026-10-1${at}`,
          former: false,
          timeZone: TZ,
        })),
      ],
      ripples: [
        ...EVERYONE.ripples,
        ...writers.map((author_id, at) =>
          ripple({ id: `r-x${at}`, splash_id: 's-joint', author_id, occurred_on: '2026-10-20' }),
        ),
      ],
    };
    const band = ground(crowded).container.querySelector('[data-lane-band="s-joint"]')!;
    expect(band.textContent).toContain('+4');
  });
  it('is one row in the List view: icon, title, lane chip, then faces; no sub-rows', () => {
    setView('date');
    const { container } = ground(A);
    const rows = container.querySelectorAll('[data-pill="s-joint"]');
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.textContent).toContain('🏛️');
    expect(row.textContent).toContain('Lost Ruins of Arnak');
    expect(row.textContent).toContain('Media');
    expect(row.querySelectorAll('[data-joint-faces] > :not([data-joint-more])')).toHaveLength(2);
    // The faces come after the lane chip; no ripple count (review: reactions instead).
    expect(row.querySelector('[data-joint-count]')).toBeNull();
    const chip = [...row.querySelectorAll('span')].find(
      (el) => el.className.includes('rounded-full') && el.textContent?.includes('Media'),
    )!;
    const faces = row.querySelector('[data-joint-faces]')!;
    expect(chip.compareDocumentPosition(faces) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('[data-joint-sub]')).toBeNull();
    expect(container.querySelector('[data-joint-rows]')).toBeNull();
  });

  it('counts its reactions on its row, and shows none when there are none', () => {
    setView('date');
    const reacted: PoolView = {
      ...A,
      responded: {
        reactions: [
          {
            ripple_id: 'r-j1',
            user_id: ME,
            emoji: '❤️',
            created_at: '2026-10-21T01:00:00Z',
            thread_pool_id: null,
          },
          {
            ripple_id: 'r-j2',
            user_id: MINA,
            emoji: '🔥',
            created_at: '2026-10-21T02:00:00Z',
            thread_pool_id: null,
          },
        ],
        replies: [],
      },
    };
    const { container } = ground(reacted);
    expect(container.querySelector('[data-pill="s-joint"] [data-row-reactions]')!.textContent).toBe(
      '2',
    );
    expect(container.querySelector('[data-pill="s-mine"] [data-row-reactions]')).toBeNull();
  });
  it('comes to the top of the stack from its Date-view row', () => {
    setView('date');
    const { container } = ground(A);
    fireEvent.click(container.querySelector('[data-pill="s-joint"]')!);
    expect(container.querySelector('[data-pill="s-joint"]')!.hasAttribute('data-dived')).toBe(
      false,
    );
  });

  it('is a mark in its pool lane’s column in the Lane view, not a band (review)', () => {
    setView('lane');
    const { container } = ground(A);
    expect(container.querySelector('[data-joint-band]')).toBeNull();
    expect(
      container.querySelector('[data-lane-piece="s-joint"][data-cell="l-media"]'),
    ).not.toBeNull();
  });

  it('comes to the top of the stack from its band', async () => {
    setView('members');
    const { container } = ground(EVERYONE);
    fireEvent.click(container.querySelector('[data-lane-band="s-joint"] [data-board-pick]')!);
    await waitFor(() =>
      expect(
        container
          .querySelector('[data-stack-card][data-slot="0"]')!
          .getAttribute('data-stack-card'),
      ).toBe('s-joint'),
    );
  });
});

describe('Members (H23)', () => {
  it('has a column per current member, me first, never a former member', () => {
    setView('members');
    const { container } = ground(A);
    const headers = [...container.querySelectorAll('[data-lane-header]')]
      .map((h) => h.getAttribute('data-lane-header'))
      .filter(Boolean);
    expect(headers).toEqual([ME, MINA]);
  });

  it('puts each placed post in its author’s column', () => {
    setView('members');
    const { container } = ground(A);
    expect(
      container.querySelector('[data-lane-piece="s-mina"][data-cell="u-mina"]'),
    ).not.toBeNull();
  });
});

describe('switching pools (H23)', () => {
  it('lists my face, then my pools on the strip, the current one ringed, news dotted', () => {
    const { container } = ground(A);
    const strip = container.querySelector('[data-home-foot="phone"] [data-place-strip]')!;
    const order = [...strip.children].map(
      (el) =>
        (el.hasAttribute('data-strip-settings') && 'settings') ||
        (el.hasAttribute('data-strip-home') && 'home') ||
        el.getAttribute('data-strip-pool') ||
        (el.hasAttribute('data-strip-new') && 'new'),
    );
    // The order I joined them in, newest first; the `+` closes the strip.
    // No gear on the strip (0059): the header's.
    expect(order).toEqual(['home', 'p-a', 'p-b', 'new']);
    const current = strip.querySelector('[data-strip-pool="p-a"]')!;
    expect(current.getAttribute('aria-current')).toBe('page');
    // Selected: a white border, and a pool is a rounded square, not a circle.
    expect(current.className).toContain('ring-white');
    expect(current.className).toContain('rounded-lg');
    expect(current.querySelector('[data-place-image]')!.className).not.toContain('opacity-50');
    // Not selected: faded — the image only, so the dot stays full strength.
    const other = strip.querySelector('[data-strip-pool="p-b"]')!;
    expect(other.querySelector('[data-place-image]')!.className).toContain('opacity-50');
    expect(other.querySelector('[data-place-image] [data-unseen-dot]')).toBeNull();
    // I am a circle.
    expect(strip.querySelector('[data-strip-home]')!.className).toContain('rounded-full');
    // Something happened in B since a visit that never was: the dot.
    expect(strip.querySelector('[data-strip-pool="p-b"] [data-unseen-dot]')).not.toBeNull();
    expect(strip.querySelector('[data-strip-pool="p-a"] [data-unseen-dot]')).toBeNull();
    expect(strip.querySelector('[data-strip-pool="p-b"]')!.getAttribute('href')).toBe('/pool/p-b');
    expect(strip.querySelector('[data-strip-new]')!.getAttribute('href')).toBe('/pool/new');
    // A pool to be is the pools' rounded square too.
    expect(strip.querySelector('[data-strip-new]')!.className).toContain('rounded-lg');
    // No name dropdown any more: the strip is the way between pools.
    expect(container.querySelector('[data-pool-switcher]')).toBeNull();
  });

  it('keeps its order when another pool is opened: a place never moves when tapped', () => {
    const order = () =>
      [...document.querySelectorAll('[data-home-foot="phone"] [data-strip-pool]')].map((el) =>
        el.getAttribute('data-strip-pool'),
      );
    ground(A);
    expect(order()).toEqual(['p-a', 'p-b']);
    cleanup();
    // Opening B (it is now the most recently visited) moves nothing.
    ground(B);
    expect(order()).toEqual(['p-a', 'p-b']);
    expect(
      document
        .querySelector('[data-home-foot="phone"] [data-strip-pool="p-b"]')!
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('lists the same places in the same order on the wide rail', () => {
    const { container } = ground(A);
    const ids = (slot: string) =>
      [
        ...container.querySelectorAll(
          `[data-home-foot="${slot}"] [data-strip-home], [data-home-foot="${slot}"] [data-strip-pool], [data-home-foot="${slot}"] [data-strip-new]`,
        ),
      ].map(
        (el) =>
          el.getAttribute('data-strip-pool') ??
          (el.hasAttribute('data-strip-home') ? 'home' : 'new'),
      );
    expect(ids('wide')).toEqual(ids('phone'));
    expect(ids('wide')).toEqual(['home', 'p-a', 'p-b', 'new']);
  });

  it('shows only the other pool’s records once switched, in the same view', () => {
    setView('members');
    const first = ground(A).container;
    expect(first.querySelector('[data-lane-piece=\"s-mine\"]')).not.toBeNull();
    cleanup();
    const second = ground(B).container;
    expect(second.querySelector('[data-lane-piece=\"s-study\"]')).not.toBeNull();
    for (const id of ['s-mine', 's-mina', 's-joint']) {
      expect(second.querySelector(`[data-lane-piece="${id}"]`)).toBeNull();
    }
    expect(
      second.querySelector('[data-view-option="members"]')!.getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('opens the last pool viewed on this device, after a reload', () => {
    ground(B);
    expect(lastPool()).toBe('p-b');
    cleanup();
    // A reload: the Pool tab asks the device which pool to open.
    render(
      <InputSheetProvider>
        <PoolIndex poolIds={['p-a', 'p-b']} />
      </InputSheetProvider>,
    );
    expect(replaced).toEqual(['/pool/p-b']);
  });

  it('opens the pool joined last when this device remembers none', () => {
    render(
      <InputSheetProvider>
        <PoolIndex poolIds={['p-a', 'p-b']} />
      </InputSheetProvider>,
    );
    expect(replaced).toEqual(['/pool/p-a']);
  });

  it('drops a pool’s dot once visited', () => {
    rememberVisit('p-b', new Date('2026-10-23T00:00:00Z'));
    const { container } = ground(A);
    expect(
      container.querySelector('[data-home-foot="phone"] [data-strip-pool="p-b"] [data-unseen-dot]'),
    ).toBeNull();
  });
});

describe('leaving (H23)', () => {
  it('asks to keep or remove before anything happens', () => {
    const { container, getByText } = ground(A);
    // Another member's face opens the members (0059).
    fireEvent.click(container.querySelector('[data-place-face]:not([data-place-face="me"])')!);
    expect(container.ownerDocument.querySelector('[data-former-member]')).not.toBeNull();
    fireEvent.click(getByText('Leave Pool'));
    expect(getByText('Keep your records in this Pool?')).toBeTruthy();
    expect(getByText('Keep them')).toBeTruthy();
    expect(getByText('Remove them')).toBeTruthy();
  });
});

describe('pool lanes (H23)', () => {
  it('keeps the add form open, cleared, after each lane so the next can follow', () => {
    // The pool's lanes are its settings sheet's Pool tab (0059).
    window.history.replaceState(null, '', '/pool/p-a?settings=pool');
    const { container, getByText } = ground(A);
    window.history.replaceState(null, '', '/');
    fireEvent.click(getByText('+ Add lane'));
    const doc = container.ownerDocument;
    for (const name of ['Books', 'Walks']) {
      const field = doc.querySelector(
        '[data-pool-lane-form] [aria-label="Lane name"]',
      ) as HTMLInputElement;
      expect(field.value).toBe('');
      fireEvent.change(field, { target: { value: name } });
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(doc.querySelector('[data-pool-lane-form]')).not.toBeNull();
    }
    const listed = [...doc.querySelectorAll('[data-pool-lane]')].map((el) => el.textContent);
    expect(listed.some((t) => t?.includes('Books'))).toBe(true);
    expect(listed.some((t) => t?.includes('Walks'))).toBe(true);
  });
});

describe('Just mine in the pool (0014)', () => {
  it('is a mark in its pool lane’s column, never a band', () => {
    setView('lane');
    const { container } = ground(A);
    expect(
      container.querySelector('[data-lane-piece="s-own"][data-cell="l-media"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-joint-band="s-own"]')).toBeNull();
  });

  it('is a mark in my column in Members', () => {
    setView('members');
    const { container } = ground(A);
    expect(container.querySelector(`[data-lane-piece="s-own"][data-cell="${ME}"]`)).not.toBeNull();
  });
});

describe('re-tapping Pool (review)', () => {
  it('opens every visit on the Calendar, whatever was viewed before, then cycles Members → Lane → List → Calendar', () => {
    // A view chosen on an earlier visit, as the old build kept it: no longer read.
    window.localStorage.setItem('weming.pool-view', 'members');
    const { container } = render(
      <PoolActivityProvider activity={ACTIVITY} pools={POOLS}>
        <InputSheetProvider>
          <PoolGround view={A} me={ME} today="2026-10-23" timeZone={TZ} />
        </InputSheetProvider>
      </PoolActivityProvider>,
    );
    const tab = container.querySelector('[data-home-foot="phone"] [data-pool-tab]') as HTMLElement;
    const selected = (): string | null =>
      container
        .querySelector('[data-view-option][aria-selected="true"]')!
        .getAttribute('data-view-option');
    expect(
      [...container.querySelectorAll('[data-view-option]')].map((o) =>
        o.getAttribute('data-view-option'),
      ),
    ).toEqual(['board', 'members', 'lane', 'date']);
    // Every visit opens on the Calendar (review).
    expect(selected()).toBe('board');
    expect(container.querySelector('[data-month-board]')).not.toBeNull();
    // The stack stays beside or beneath it, as in the Lane view.
    expect(container.querySelector('[data-stack-card]')).not.toBeNull();
    fireEvent.click(tab);
    expect(selected()).toBe('members');
    fireEvent.click(tab);
    expect(selected()).toBe('lane');
    fireEvent.click(tab);
    expect(selected()).toBe('date');
    // Not kept on the device: the next visit opens on the Calendar again.
    expect(window.localStorage.getItem('weming.pool-view')).toBe('members');
    fireEvent.click(tab);
    expect(selected()).toBe('board');
    // The desktop rail cycles too.
    fireEvent.click(container.querySelector('[data-home-foot="wide"] [data-pool-tab]')!);
    expect(selected()).toBe('members');
  });
});

describe('a pool lane’s header (review)', () => {
  it('opens its lane page, as a lane’s header does on Home', () => {
    setView('lane');
    const { container } = ground(A);
    const header = container.querySelector('[data-lane-header="l-food"]')!;
    expect(header.getAttribute('href')).toBe('/pool/p-a/lane/l-food');
  });

  it('opens nothing for a member’s column in Members', () => {
    setView('members');
    const { container } = ground(A);
    expect(container.querySelector(`[data-lane-header="${MINA}"]`)!.tagName).not.toBe('A');
  });
});

describe('faces (0018)', () => {
  it('writes authors out by name in the Date view, never as initials', () => {
    setView('date');
    const { container } = ground(A);
    const rows = [...container.querySelectorAll('[data-row-author]')].map((a) => a.textContent);
    expect(new Set(rows)).toEqual(new Set(['Yoonji Lee', 'Mina']));
  });

  const PEOPLE = {
    [ME]: { name: 'Yoonji Lee', photo: 'https://signed/me' },
    [MINA]: { name: 'Mina Kim', photo: 'https://signed/mina' },
    [GONE]: { name: 'Gone', photo: null },
  };
  const faces = (view: PoolView) =>
    render(
      <PeopleProvider me={ME} people={PEOPLE}>
        <InputSheetProvider>
          <PoolGround
            view={view}
            me={ME}
            today="2026-10-23"
            timeZone={TZ}
            initialView={startView}
          />
        </InputSheetProvider>
      </PeopleProvider>,
    );
  const srcs = (root: Element | null) =>
    [...(root?.querySelectorAll('img') ?? [])].map((img) => img.getAttribute('src'));

  it('shows each member’s photo in the header, the Members headers and the members sheet', () => {
    setView('members');
    const { container } = faces(A);
    expect(srcs(container.querySelector('[data-place-faces]'))).toEqual([
      'https://signed/me',
      'https://signed/mina',
    ]);
    expect(srcs(container.querySelector(`[data-lane-header="${MINA}"]`))).toEqual([
      'https://signed/mina',
    ]);
    // A renamed member reads by their new name.
    expect(container.querySelector(`[data-lane-header="${MINA}"]`)!.textContent).toContain(
      'Mina Kim',
    );
    fireEvent.click(container.querySelector(`[data-place-face="${MINA}"]`)!);
    expect(srcs(container.querySelector(`[data-member="${MINA}"]`))).toEqual([
      'https://signed/mina',
    ]);
    // A former member has no photo for me: initials.
    expect(container.querySelector(`[data-member="${GONE}"]`)!.textContent).toContain('GO');
  });

  it('names each author on their column, written out', () => {
    setView('members');
    const { container } = faces(A);
    expect(container.querySelector('[data-lane-header="u-mina"]')!.textContent).toContain(
      'Mina Kim',
    );
  });
});

describe('moving a pool’s splash to another lane (0020, review)', () => {
  function Mover({
    id,
    to,
  }: {
    id: string;
    to: { id: string; icon: string; name: string } | null;
  }) {
    const { markEdited, clearEdited } = useInputSheet();
    useEffect(() => {
      if (to) markEdited(id, { title: 'Lost Ruins of Arnak', icon: '🏛️', poolLane: to });
      else clearEdited(id);
    }, [id, to, markEdited, clearEdited]);
    return null;
  }
  const FOOD = { id: 'l-food', icon: '🍽️', name: 'Food' };
  const moved = (to: typeof FOOD | null) =>
    render(
      <InputSheetProvider>
        <Mover id="s-joint" to={to} />
        <PoolGround view={A} me={ME} today="2026-10-23" timeZone={TZ} initialView={startView} />
      </InputSheetProvider>,
    );

  it('shows the move at once: its mark in the new lane, its tag and chip naming it', () => {
    setView('lane');
    const { container } = moved(FOOD);
    expect(
      container.querySelector('[data-lane-piece="s-joint"][data-cell="l-food"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-lane-piece="s-joint"][data-cell="l-media"]')).toBeNull();
  });

  it('goes back where it was when the edit is taken back', () => {
    setView('lane');
    const { container, rerender } = moved(FOOD);
    rerender(
      <InputSheetProvider>
        <Mover id="s-joint" to={null} />
        <PoolGround view={A} me={ME} today="2026-10-23" timeZone={TZ} initialView={startView} />
      </InputSheetProvider>,
    );
    expect(
      container.querySelector('[data-lane-piece="s-joint"][data-cell="l-media"]'),
    ).not.toBeNull();
  });

  it('names the new lane on its Date-view row at once', () => {
    setView('date');
    const { container } = moved(FOOD);
    expect(container.querySelector('[data-pill="s-joint"]')!.textContent).toContain('Food');
  });
});

describe('a conversion shows at once (0022)', () => {
  function Convert({ id, kind }: { id: string; kind: 'joint' | 'own' }) {
    const { markEdited } = useInputSheet();
    useEffect(
      () =>
        markEdited(id, {
          title: 'Fried egg',
          icon: null,
          kind,
          poolLane: { id: 'l-food', icon: '🍽️', name: 'Food' },
        }),
      [id, kind, markEdited],
    );
    return null;
  }

  it('my placed splash made joint is a band across Members at once', () => {
    setView('members');
    const { container } = render(
      <InputSheetProvider>
        <Convert id="s-mine" kind="joint" />
        <PoolGround view={A} me={ME} today="2026-10-23" timeZone={TZ} initialView={startView} />
      </InputSheetProvider>,
    );
    expect(container.querySelector('[data-lane-band="s-mine"]')).not.toBeNull();
    expect(container.querySelector('[data-lane-piece="s-mine"]')).toBeNull();
  });
  it('a joint splash made mine is a mark under my name at once', () => {
    setView('members');
    const { container } = render(
      <InputSheetProvider>
        <Convert id="s-joint" kind="own" />
        <PoolGround view={A} me={ME} today="2026-10-23" timeZone={TZ} initialView={startView} />
      </InputSheetProvider>,
    );
    expect(container.querySelector('[data-joint-band="s-joint"]')).toBeNull();
    expect(
      container.querySelector(`[data-lane-piece="s-joint"][data-cell="${ME}"]`),
    ).not.toBeNull();
  });
});

describe('a joint splash reads as the pool’s at a glance (review)', () => {
  it('is a filled label in the Lane view; a post of one person has none', () => {
    setView('lane');
    const { container } = ground(A);
    const joint = container.querySelector('[data-lane-piece="s-joint"] [data-board-piece]')!;
    expect(['white', 'ink']).toContain(joint.getAttribute('data-label'));
    const mine = container.querySelector('[data-lane-piece="s-mine"] [data-board-piece]')!;
    expect(mine.getAttribute('data-label')).toBe('none');
  });
  it('is a plain row in the List view, as every other: no pill, no background (review)', () => {
    setView('date');
    const { container } = ground(A);
    const row = container.querySelector('[data-pill="s-joint"]')!;
    expect(row.hasAttribute('data-joint-pill')).toBe(true);
    expect(row.className).not.toMatch(/rounded-full|bg-/);
    const plain = container.querySelector('[data-pill="s-mine"]')!;
    expect(plain.hasAttribute('data-joint-pill')).toBe(false);
    expect(plain.className).not.toMatch(/rounded-full|bg-|border-b/);
  });

  it('groups rows under a date divider: the day and its weekday, then a thin line', () => {
    setView('date');
    const { container } = ground(A);
    const divider = container.querySelector('[data-day-row="2026-10-20"]')!;
    expect(divider.textContent).toContain('20');
    expect(divider.querySelector('[data-day-divider]')!.className).toContain('bg-white/20');
  });
  it('is not marked joint-filled with Everyone off and nobody besides its maker picked (0033)', () => {
    setView('date');
    const { container } = ground({ ...A, together: { 's-joint': [MINA] } });
    const row = container.querySelector('[data-pill="s-joint"]')!;
    expect(row.hasAttribute('data-joint-pill')).toBe(false);
  });
  it('is a pill for my record with someone with it in this pool, a plain row without (0035)', () => {
    setView('date');
    const plain = ground(A);
    expect(
      plain.container.querySelector('[data-pill="s-mine"]')!.hasAttribute('data-joint-pill'),
    ).toBe(false);
    plain.unmount();
    const { container } = ground({ ...A, placementTogether: { 's-mine': [MINA] } });
    expect(container.querySelector('[data-pill="s-mine"]')!.hasAttribute('data-joint-pill')).toBe(
      true,
    );
  });

  it('is a pill with Everyone on, even in a pool of one (0033)', () => {
    setView('date');
    const { container } = ground({
      ...A,
      splashes: A.splashes.map((s) => (s.id === 's-joint' ? { ...s, joint_invite_all: true } : s)),
      together: { 's-joint': [MINA] },
    });
    expect(container.querySelector('[data-pill="s-joint"]')!.hasAttribute('data-joint-pill')).toBe(
      true,
    );
  });
});

describe('the joint surface is solid, and the faces’ ring is its colour (review)', () => {
  const SURFACE = 'bg-joint';
  const RING = 'ring-joint';
  const faces = (root: Element) => [
    ...root.querySelectorAll('[data-joint-faces] > :not([data-joint-more])'),
  ];

  it('on the Members band: the Calendar’s band, its faces ringed in the joint colour', () => {
    setView('members');
    const band = ground(EVERYONE).container.querySelector('[data-lane-band="s-joint"]')!;
    expect(band.querySelector('[data-board-band]')!.className).toContain('bg-white/20');
    const ringed = [...band.querySelectorAll('[data-board-faces] *')].filter((el) =>
      el.className.toString().includes(RING),
    );
    expect(ringed.length).toBeGreaterThan(0);
  });
  it('on the List view’s row: no surface, its faces ringed in the joint colour', () => {
    setView('date');
    const row = ground(A).container.querySelector('[data-pill="s-joint"]')!;
    expect(row.className).not.toContain(SURFACE);
    expect(faces(row).every((face) => face.className.includes(RING))).toBe(true);
  });
});

describe('a day reads newest first, bands and marks alike (review)', () => {
  // An older post of mine on the joint splash's day (Oct 20), written before it.
  const C: PoolView = {
    ...A,
    splashes: [
      ...A.splashes,
      splash({
        id: 's-old',
        title: 'Older',
        declared_start: '2026-10-20',
        created_at: '2026-10-19T18:00:00.000Z',
      }),
    ],
    ripples: [
      ...A.ripples,
      ripple({
        id: 'r-old',
        splash_id: 's-old',
        occurred_on: '2026-10-20',
        created_at: '2026-10-19T18:00:00.000Z',
      }),
    ],
    placements: [
      ...A.placements,
      { splashId: 's-old', poolId: 'p-a', poolLaneId: 'l-food', shared: true, ownerId: ME },
    ],
  };

  it('puts the newer band above the older piece of the same day, the date named once', () => {
    setView('members');
    const { container } = ground({ ...C, splashes: C.splashes.map(everyoneOn) });
    const band = container.querySelector('[data-lane-band="s-joint"]')!;
    const older = container.querySelector('[data-lane-piece="s-old"]')!;
    expect(band.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Oct 20 is named on the band's rail; the row after it leaves the rail blank.
    expect(container.querySelectorAll('[data-day-row="2026-10-20"]')).toHaveLength(1);
    expect(container.querySelector('[data-day-continued="2026-10-20"]')).not.toBeNull();
  });
});

describe('a joint band on top of the stack reads as the top card does (review)', () => {
  it('bobs once it is the post being read (review)', async () => {
    setView('members');
    const { container } = ground(EVERYONE);
    const tape = () => container.querySelector('[data-lane-band="s-joint"] [data-board-tape]')!;
    expect(tape().hasAttribute('data-heading')).toBe(false);
    fireEvent.click(container.querySelector('[data-lane-band="s-joint"] [data-board-pick]')!);
    await waitFor(() => expect(tape().hasAttribute('data-heading')).toBe(true));
  });
});

describe('a pool drawn with the Calendar’s pieces (review)', () => {
  const ids = (root: Element): string[] => [
    ...[...root.querySelectorAll('[data-lane-piece]')].map((el) =>
      el.getAttribute('data-lane-piece')!,
    ),
    ...[...root.querySelectorAll('[data-lane-band]')].map((el) =>
      el.getAttribute('data-lane-band')!,
    ),
  ];

  it('draws every record once in the Lane view and in Members, a band once', () => {
    for (const view of ['lane', 'members'] as const) {
      setView(view);
      const { container } = ground(EVERYONE);
      const seen = ids(container);
      expect(new Set(seen).size, view).toBe(seen.length);
      expect(seen.sort(), view).toEqual(
        EVERYONE.splashes
          .map((s) => s.id)
          .filter((id) => seen.includes(id))
          .sort(),
      );
      expect(seen).toContain('s-joint');
      cleanup();
    }
  });

  it('spans Members with a member’s own record shared here with Everyone on', () => {
    setView('members');
    const open: PoolView = {
      ...A,
      placements: A.placements.map((p) =>
        p.splashId === 's-mina' ? { ...p, inviteAll: true } : p,
      ),
    };
    const { container } = ground(open);
    expect(container.querySelectorAll('[data-lane-band="s-mina"]')).toHaveLength(1);
    expect(container.querySelector('[data-lane-piece="s-mina"]')).toBeNull();
    // In the Lane view it stays a piece in its pool lane.
    cleanup();
    setView('lane');
    expect(
      ground(open).container.querySelector('[data-lane-piece="s-mina"][data-cell="l-food"]'),
    ).not.toBeNull();
  });

  it('keeps a photo hidden by the pool’s Lane layout off the Lane view', () => {
    setView('lane');
    const pictured: PoolView = {
      ...A,
      ripples: A.ripples.map((r) =>
        r.splash_id === 's-mine' ? { ...r, media: [`${ME}/a.webp`, `${ME}/b.webp`] } : r,
      ),
      laneLayouts: { 's-mine': { photos: { [`${ME}/a.webp`]: { hidden: true } } } },
    };
    const { container } = ground(pictured);
    const piece = container.querySelector('[data-lane-piece="s-mine"]')!;
    expect(piece.querySelector(`[data-board-photo-card="${ME}/a.webp"]`)).toBeNull();
    expect(piece.querySelector(`[data-board-photo-card="${ME}/b.webp"]`)).not.toBeNull();
  });
});

describe('Members layouts (0047)', () => {
  it('applies a band’s own layout to the band: label across the full width, icon, wave', () => {
    setView('members');
    const laidOut: PoolView = {
      ...EVERYONE,
      membersLayouts: {
        's-joint': {
          label: { x: 0.5, y: 1, tilt: 5, fontSize: 14 },
          icon: { size: 2 },
          wave: { on: true },
        },
      },
    };
    const { container } = ground(laidOut);
    const band = container.querySelector('[data-lane-band="s-joint"]')!;
    const tape = band.querySelector<HTMLElement>('[data-board-tape]')!;
    const words = band.querySelector<HTMLElement>('[data-board-band]')!;
    // X is a share of the band's full width.
    const half = parseFloat(tape.style.width) / 2;
    expect(words.style.transform).toContain(`translate(${half}px`);
    expect(words.style.transform).toContain('rotate(5deg)');
    expect(words.style.fontSize).toBe('14px');
    expect(band.querySelector<HTMLElement>('[data-band-icon]')!.style.fontSize).toBe('34px');
    expect(band.querySelector('[data-board-wave]')).not.toBeNull();
  });

  it('draws the Calendar’s and the Lane view’s layouts nowhere in Members', () => {
    setView('members');
    const elsewhere: PoolView = {
      ...EVERYONE,
      layouts: { 's-joint': { label: { tilt: 9 } } },
      laneLayouts: { 's-joint': { label: { tilt: 9 } } },
    };
    const words = ground(elsewhere).container.querySelector<HTMLElement>(
      '[data-lane-band="s-joint"] [data-board-band]',
    )!;
    expect(words.style.transform ?? '').not.toContain('rotate(9deg)');
  });
});

describe('whose a record is, in a pool (review)', () => {
  const authored = (root: Element) =>
    [...root.querySelectorAll('[data-board-author]')].map((el) =>
      el.closest('[data-board-piece]')!.getAttribute('data-board-piece'),
    );

  it('puts its author’s face after the title in the Lane view, mine included; never on a joint record', () => {
    setView('lane');
    const { container } = ground(A);
    const ids = authored(container);
    expect(ids).toEqual(expect.arrayContaining(['s-mine', 's-mina']));
    expect(ids).not.toContain('s-joint');
    const face = container.querySelector<HTMLElement>(
      '[data-lane-piece="s-mina"] [data-board-author] > *',
    )!;
    expect(['12px', '14px']).toContain(face.style.width);
  });

  it('in the Calendar too', () => {
    setView('board');
    const { container } = ground(A);
    expect(
      container.querySelector('[data-board-piece="s-mina"] [data-board-author]'),
    ).not.toBeNull();
  });

  it('in the List, before the name', () => {
    setView('date');
    const { container } = ground(A);
    const row = container.querySelector('[data-pill="s-mina"]')!;
    const face = row.querySelector('[data-row-author-face]')!;
    expect(face).not.toBeNull();
    expect(
      face.compareDocumentPosition(row.querySelector('[data-row-author]')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector('[data-pill="s-joint"] [data-row-author-face]')).toBeNull();
  });

  it('never in Members, whose column says who', () => {
    setView('members');
    expect(ground(A).container.querySelector('[data-board-author]')).toBeNull();
  });
});

describe('the header, Home’s in shape (0059)', () => {
  it('is the pool, the bell, its members’ faces, the invite, the gear; then the four views', () => {
    const { container } = ground(A);
    const header = container.querySelector('[data-pool-header]')!;
    expect(header.querySelector('[data-place-title]')!.textContent).toBe('Our Pool');
    const row = header.querySelector('[data-place-header-row]')!;
    const order = [
      ...row.querySelectorAll(
        '[data-notifications-bell], [data-place-face], [data-pool-invite], [data-place-settings]',
      ),
    ].map((el) =>
      el.hasAttribute('data-notifications-bell')
        ? 'bell'
        : el.hasAttribute('data-place-face')
          ? 'face'
          : el.hasAttribute('data-pool-invite')
            ? 'invite'
            : 'gear',
    );
    expect(order[0]).toBe('bell');
    expect(order.slice(-2)).toEqual(['invite', 'gear']);
    expect(order.filter((o) => o === 'face').length).toBeGreaterThan(0);
    expect(
      [...header.querySelectorAll('[data-place-tabs] [data-view-option]')].map(
        (o) => o.textContent,
      ),
    ).toEqual(['Calendar', 'Members', 'Lane', 'List']);
    // No lane glyph or settings link beside the views any more.
    expect(container.querySelector('[data-manage-pool-lanes], [data-pool-settings]')).toBeNull();
  });
});
