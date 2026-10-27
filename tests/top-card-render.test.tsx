// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The top card as the reading surface (H25, review): each ripple's photos
 * under its words, its reaction chips — reacting in place, optimistically —
 * and its first two replies with "+n"; the card keeps its fixed height and
 * fades out what does not fit.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock('@/lib/media', () => ({
  signBoardPhotos: (photos: { path: string }[]) =>
    Promise.resolve(Object.fromEntries(photos.map((p) => [p.path, `https://signed/${p.path}`]))),
}));
const { reacted } = vi.hoisted(() => ({
  reacted: [] as { rippleId: string; emoji: string; on: boolean }[],
}));
vi.mock('@/features/responses/actions', () => ({
  setReaction: (input: { rippleId: string; emoji: string; on: boolean }) => {
    reacted.push(input);
    return Promise.resolve({ ok: true });
  },
  addReply: () => Promise.resolve({ ok: true }),
  editReply: () => Promise.resolve({ ok: true }),
  deleteReply: () => Promise.resolve({ ok: true }),
  hideReply: () => Promise.resolve({ ok: true }),
}));

import { CARD_FADE_PX, CARD_PX } from '@/features/home/card-face';
import { placeCard, type Card } from '@/features/home/grid';
import { HomeGround } from '@/features/home/home-ground';
import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { PeopleProvider } from '@/features/people/people-provider';
import type { ReactionRow, ReplyRow } from '@/features/responses/model';
import { summarizeSplash, type Splash } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';

import { written } from './written-on';

const TZ = 'America/Vancouver';
const TODAY = '2026-09-25';
const ME = 'u-yl';
const MINA = 'u-mina';

const LANES: MyCategory[] = [
  {
    id: 'c-day',
    user_id: ME,
    name: 'Day',
    icon: '🖋',
    default_mode: 'drop',
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
  },
];

beforeEach(() => {
  reacted.length = 0;
  window.localStorage.clear();
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
});
afterEach(cleanup);

function splash(id: string, title: string): Splash {
  return written({
    id,
    owner_id: ME,
    title,
    declared_start: '2026-09-20',
    declared_end: null,
    declared_lane_id: 'c-day',
    session_id: null,
    icon: null,
    pinned_at: null,
    pool_id: null,
    pool_lane_id: null,
    own_pool_id: null,
    joint_invite_all: false,
    created_by: null,
    type: 'free',
    prompt: null,
    ends_at: null,
    created_at: '2026-09-20T16:00:00.000Z',
  });
}

const reaction = (ripple: string, user: string, emoji: string, at: string): ReactionRow => ({
  ripple_id: ripple,
  user_id: user,
  emoji,
  created_at: `2026-09-21T${at}:00:00Z`,
});
const reply = (id: string, ripple: string, body: string, at: string): ReplyRow => ({
  id,
  ripple_id: ripple,
  author_id: MINA,
  body,
  created_at: `2026-09-22T${at}:00:00Z`,
  edited_at: null,
  hidden: false,
  former: false,
});

/** A post with two ripples: four photos and three replies on the first, one reply on the second. */
function rich(): Card {
  const summary = summarizeSplash(splash('rich', 'Tofino'), [], TZ, new Date(`${TODAY}T20:00:00Z`));
  return {
    ...placeCard(summary, 'surf\n\nsun', TZ, [
      { id: 'r1', note: 'surf', createdAt: '2026-09-20T17:00:00Z' },
      { id: 'r2', note: 'sun', createdAt: '2026-09-20T18:00:00Z' },
    ]),
    photos: ['a', 'b', 'c', 'd'].map((p) => ({ rippleId: 'r1', path: `${ME}/${p}.webp` })),
    responded: {
      value: {
        reactions: [reaction('r1', MINA, '❤️', '01'), reaction('r1', ME, '❤️', '02')],
        replies: [
          reply('x1', 'r1', 'so jealous', '01'),
          reply('x2', 'r1', 'which beach?', '02'),
          reply('x3', 'r1', 'next time me', '03'),
          reply('y1', 'r2', 'nice', '04'),
        ],
      },
      locked: [],
    },
  };
}

function plain(): Card {
  const summary = summarizeSplash(splash('plain', 'Lunch'), [], TZ, new Date(`${TODAY}T20:00:00Z`));
  return placeCard(summary, 'noodles', TZ, [
    { id: 'p1', note: 'noodles', createdAt: '2026-09-20T17:00:00Z' },
  ]);
}

function home(cards: Card[]) {
  return render(
    <PeopleProvider me={ME} people={{}}>
      <InputSheetProvider>
        <HomeGround
          initialView="lane"
          cards={cards}
          pinned={[]}
          categories={LANES}
          today={TODAY}
          timeZone={TZ}
          initials="YL"
          scrollToMonth={null}
        />
      </InputSheetProvider>
    </PeopleProvider>,
  );
}

const withAttr = (root: Element, name: string, value: string): HTMLElement =>
  [...root.querySelectorAll<HTMLElement>(`[${name}]`)].find(
    (el) => el.getAttribute(name) === value,
  )!;
const topCard = (root: Element): HTMLElement =>
  root.querySelector<HTMLElement>('[data-stack-card][data-slot="0"]')!;

describe('the top card reads each ripple in full (H25, review)', () => {
  it('shows a ripple’s photos under its words: three in a row, "+n" beyond', async () => {
    const { container } = home([rich()]);
    const first = topCard(container).querySelector('[data-card-ripple="r1"]')!;
    expect(first.querySelectorAll('[data-card-photo]')).toHaveLength(3);
    expect(first.querySelector('[data-card-photos-more]')!.textContent).toBe('+1');
    await waitFor(() =>
      expect(first.querySelector('img')!.getAttribute('src')).toBe(`https://signed/${ME}/a.webp`),
    );
    // The second ripple has words and no photos.
    expect(
      topCard(container).querySelector('[data-card-ripple="r2"] [data-card-photos]'),
    ).toBeNull();
  });

  it('shows each ripple’s reaction chips, mine marked, and a "+" to add', () => {
    const { container } = home([rich()]);
    const responses = topCard(container).querySelector('[data-card-responses="r1"]')!;
    const heart = responses.querySelector<HTMLElement>('[data-reaction="❤️"]')!;
    expect(heart.textContent).toContain('2');
    expect(heart.hasAttribute('data-mine')).toBe(true);
    expect(responses.querySelector('[data-reaction-add]')).not.toBeNull();
  });

  it('shows the first two replies per ripple, then "+n" into the sheet at the next', () => {
    const { container } = home([rich()]);
    const card = topCard(container);
    const first = card.querySelector('[data-card-responses="r1"]')!;
    const lines = [...first.querySelectorAll<HTMLAnchorElement>('[data-card-reply]')];
    expect(lines.map((l) => l.textContent)).toEqual(['so jealous', 'which beach?']);
    expect(lines[0].getAttribute('href')).toBe('/splash/rich#reply-x1');
    const more = first.querySelector<HTMLAnchorElement>('[data-card-replies-more]')!;
    expect(more.textContent).toBe('+1 more reply');
    expect(more.getAttribute('href')).toBe('/splash/rich#reply-x3');
    const second = card.querySelector('[data-card-responses="r2"]')!;
    expect(second.querySelectorAll('[data-card-reply]')).toHaveLength(1);
    expect(second.querySelector('[data-card-replies-more]')).toBeNull();
    // The card body still opens the post.
    expect(card.querySelector('[data-card-link]')!.getAttribute('href')).toBe('/splash/rich');
  });

  it('reacts from the card in place, at once', async () => {
    const { container } = home([rich()]);
    const responses = () => topCard(container).querySelector('[data-card-responses="r2"]')!;
    fireEvent.click(responses().querySelector('[data-reaction-add]')!);
    // The picker floats over the page, out of the card's clip.
    const picker = document.body.querySelector('[data-reaction-picker]')!;
    expect(responses().contains(picker)).toBe(false);
    // By attribute value: jsdom's selector engine misses an astral emoji in a selector.
    fireEvent.click(withAttr(picker, 'data-reaction-quick', '🔥'));
    expect(withAttr(responses(), 'data-reaction', '🔥').textContent).toContain('1');
    await waitFor(() => expect(reacted).toEqual([{ rippleId: 'r2', emoji: '🔥', on: true }]));
  });

  it('offers nothing to respond to where nobody else can read the post', () => {
    const { container } = home([plain()]);
    expect(topCard(container).querySelector('[data-card-responses]')).toBeNull();
    expect(topCard(container).querySelector('[data-reactions]')).toBeNull();
  });

  it('keeps its fixed height whatever it holds, fading out what does not fit', () => {
    const heavy = home([rich()]);
    const heavyHeight = topCard(heavy.container).style.height;
    const fade = topCard(heavy.container).querySelector<HTMLElement>('[data-card-fade]')!;
    expect(fade.style.height).toBe(`${CARD_FADE_PX}px`);
    const body = topCard(heavy.container).querySelector<HTMLElement>('[data-card-body]')!;
    expect(body.className).toContain('overflow-hidden');
    expect(body.className).not.toMatch(/overflow-(auto|scroll|y-auto)/);
    cleanup();
    const light = home([plain()]);
    expect(topCard(light.container).style.height).toBe(heavyHeight);
    expect(heavyHeight).toBe(`${CARD_PX}px`);
  });
});
