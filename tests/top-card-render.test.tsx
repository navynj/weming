// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The top card as the reading surface (H25, review): each ripple's photos
 * under its words, its reaction chips — reacting in place, optimistically —
 * and every reply (on a phone, one line of them); the card keeps its fixed height and
 * fades out what does not fit.
 */

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
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
  // A wide screen: the top card in full (a phone's is compact, H42f).
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('min-width'),
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
    is_welcome: false,
    description: null,
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
  thread_pool_id: null,
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
  thread_pool_id: null,
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

  it('shows every reply per ripple on a wide screen, none folded behind "+n" (H42i)', () => {
    const { container } = home([rich()]);
    const card = topCard(container);
    const first = card.querySelector('[data-card-responses="r1"]')!;
    const lines = [...first.querySelectorAll<HTMLAnchorElement>('[data-card-reply]')];
    expect(lines.map((l) => l.textContent)).toEqual(['so jealous', 'which beach?', 'next time me']);
    expect(lines[0].getAttribute('href')).toBe('/splash/rich#reply-x1');
    expect(lines[2].getAttribute('href')).toBe('/splash/rich#reply-x3');
    expect(card.querySelector('[data-card-replies-more]')).toBeNull();
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
    await waitFor(() =>
      expect(reacted).toEqual([{ rippleId: 'r2', emoji: '🔥', on: true, poolId: null }]),
    );
  });

  it('offers nothing to respond to where nobody else can read the post', () => {
    const { container } = home([plain()]);
    expect(topCard(container).querySelector('[data-card-responses]')).toBeNull();
    expect(topCard(container).querySelector('[data-reactions]')).toBeNull();
  });

  it('offers no reaction on a post with no ripples yet, shared or not (review)', () => {
    const summary = summarizeSplash(
      splash('empty', 'Soon'),
      [],
      TZ,
      new Date(`${TODAY}T20:00:00Z`),
    );
    const empty: Card = {
      ...placeCard(summary, '', TZ, []),
      responded: { value: { reactions: [], replies: [] }, locked: [] },
    };
    const { container } = home([empty]);
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

describe('the phone’s top card: one line of responses under the fade (H42f)', () => {
  const phone = (): void => {
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
  };

  it('pins the top emoji with every reaction’s total and "n replies", outside the fade, opening the sheet at the first response', () => {
    phone();
    const card = rich();
    card.responded!.value.reactions.push(reaction('r2', MINA, '🔥', '03'));
    const { container } = home([card]);
    const top = topCard(container);
    const line = top.querySelector<HTMLAnchorElement>('[data-card-response-line]')!;
    expect(line.querySelector('[data-card-reactions]')!.textContent).toBe('❤️3');
    expect(line.querySelector('[data-card-reply-count]')!.textContent).toBe('4 replies');
    // Under the faded body, not inside it.
    const body = top.querySelector('[data-card-body]')!;
    expect(body.contains(line)).toBe(false);
    expect(body.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.className).toContain('shrink-0');
    expect(line.getAttribute('href')).toBe('/splash/rich#responded');
    // Nothing else returns: no chips, no reply previews, no thread.
    expect(top.querySelector('[data-reaction], [data-reply], [data-ripple-thread]')).toBeNull();
    expect(top.querySelectorAll('[data-card-response-line]')).toHaveLength(1);
  });

  it('says "1 reply", leaves out reactions when there are none, and draws nothing with no responses', () => {
    phone();
    const one = rich();
    one.responded!.value = { reactions: [], replies: [reply('z1', 'r1', 'hi', '01')] };
    const { container, unmount } = home([one]);
    const line = topCard(container).querySelector('[data-card-response-line]')!;
    expect(line.textContent).toBe('1 reply');
    expect(line.querySelector('[data-card-reactions]')).toBeNull();
    unmount();
    const quiet = home([plain()]);
    expect(topCard(quiet.container).querySelector('[data-card-response-line]')).toBeNull();
  });
});
