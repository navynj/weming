// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ usePathname: () => '/splash/s1', useRouter: () => router }));

// Hoisted with the mocks that use them: a vi.mock factory runs before the
// file's own top level.
const { calls, record } = vi.hoisted(() => {
  const calls: { name: string; args: unknown[] }[] = [];
  const record =
    (name: string, result: unknown = { ok: true }) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
      return Promise.resolve(result);
    };
  return { calls, record };
});
vi.mock('@/features/splash/actions', () => ({
  updateSplashHeader: record('updateSplashHeader', { ok: true, splash: {} }),
  setSplashPinned: record('setSplashPinned'),
  deleteSplash: record('deleteSplash'),
  setSplashDescription: record('setSplashDescription'),
}));
vi.mock('@/features/splash/block-actions', () => ({
  addBlock: record('addBlock', { ok: true, rippleId: 'r-new' }),
  editBlock: record('editBlock', { ok: true, rippleId: 'r' }),
}));
vi.mock('@/features/ripple-sheet/actions', () => ({
  deleteRipple: record('deleteRipple', { ok: true, rippleId: 'r' }),
  setRippleLock: record('setRippleLock', { ok: true, rippleId: 'r' }),
}));
vi.mock('@/features/responses/actions', () => ({
  setReaction: record('setReaction'),
  addReply: record('addReply'),
  editReply: record('editReply'),
  deleteReply: record('deleteReply'),
  setReplyHidden: record('setReplyHidden'),
}));
vi.mock('@/lib/compress-image', async (actual) => ({
  ...(await actual<typeof import('@/lib/compress-image')>()),
  compressImage: (file: File) =>
    Promise.resolve({ full: { blob: file, size: { w: 4, h: 3 } }, display: null }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'a1' } } }) },
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }) }) },
  }),
}));

import { InputSheetProvider, useInputSheet } from '@/features/input-sheet/sheet-provider';
import { PeopleProvider } from '@/features/people/people-provider';
import { SplashPage } from '@/features/splash/splash-page';
import { summarizeOrphan, summarizeSplash, type Splash } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import { written } from './written-on';

const TZ = 'America/Vancouver';
const TODAY = '2026-09-25';
const NOW = new Date('2026-09-25T20:00:00.000Z');

function lane(id: string, name: string, icon: string, position: number): MyCategory {
  return {
    id,
    user_id: 'a1',
    name,
    icon,
    default_mode: 'drop',
    position,
    created_at: '2026-01-01T00:00:00Z',
  };
}
const LANES = [
  lane('c-place', 'Place', '📍', 0),
  lane('c-media', 'Media', '🎬', 1),
  lane('c-day', 'Day', '🖋', 2),
];
function block(over: Partial<RippleWithSplash> & { id: string }): RippleWithSplash {
  return written({
    author_id: 'a1',
    thread_pool_id: null,
    video_previews: true,
    is_welcome: false,
    media_meta: {},
    note: 'fixture',
    media: [],
    occurred_on: null,
    occurred_time: null,
    started_at: null,
    ended_at: null,
    planned: false,
    participants: [],
    created_at: '2026-08-18T16:00:00.000Z',
    parent_ripple_id: null,
    splash_id: 's1',
    ...over,
  });
}

const board: Splash = {
  id: 's1',
  owner_id: 'a1',
  title: 'Whistler, two nights',
  declared_start: '2026-08-17',
  declared_end: '2026-08-20',
  declared_lane_id: 'c-place',
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
  created_at: '2026-08-16T16:00:00.000Z',
  written_on: '2026-08-16',
};

// Oldest first, as the page receives them.
const blocks = [
  block({ id: 'first', note: 'sea to sky', occurred_on: '2026-08-17', occurred_time: '11:30:00' }),
  block({
    id: 'night',
    note: 'the village',
    occurred_on: '2026-08-17',
    occurred_time: '21:15:00',
    media: ['a1/x.jpg'],
  }),
  block({
    id: 'later',
    note: 'watched it back',
    occurred_on: '2026-08-20',
  }),
];

beforeEach(() => {
  calls.length = 0;
  router.push.mockClear();
  router.replace.mockClear();
  router.refresh.mockClear();
  window.URL.createObjectURL = () => 'blob:preview';
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

function Deleted() {
  const { pendingDeletes } = useInputSheet();
  return <output data-deleted>{pendingDeletes.join(',')}</output>;
}

function page(over: Partial<Parameters<typeof SplashPage>[0]> = {}) {
  return render(
    <InputSheetProvider>
      <Deleted />
      <SplashPage
        splash={summarizeSplash(board, blocks, TZ, NOW)}
        blocks={blocks}
        photos={{ night: [null, 'https://signed/x.jpg'] }}
        lockedIds={[]}
        categories={LANES}
        timeZone={TZ}
        today={TODAY}
        {...over}
      />
    </InputSheetProvider>,
  );
}

describe('the white page above the water (SPEC 5, H21c)', () => {
  it('is the white detail with no back chip: the sheet it sits in closes it (review)', () => {
    const { container } = page();
    const root = container.querySelector('[data-splash-page]')!;
    expect(root.className).toContain('bg-white');
    expect(container.querySelector('[data-back-chip]')).toBeNull();
  });

  it('stacks the header left-aligned: its own lane, title, range, wave underline by blocks', () => {
    const { container } = page();
    const tags = [...container.querySelectorAll('[data-lane-tags] > span')].map(
      (t) => t.textContent,
    );
    // The post's lane alone (H24): a block's frozen Media lane adds no tag.
    expect(tags).toEqual(['📍Place']);
    expect(container.querySelector('[data-splash-title]')!.textContent).toBe(
      'Whistler, two nights',
    );
    expect(container.querySelector('[data-range]')!.textContent).toBe('2026. 8. 17 ~ 2026. 8. 20');
    expect(container.querySelector('[data-wave-underline]')!.getAttribute('data-lines')).toBe('2');
  });

  it('writes who wrote it under the date, and where it sits in a pool at that line’s end', () => {
    const { container } = render(
      <PeopleProvider me="u-me" people={{ 'u-me': { name: 'Yoonji', photo: null } }}>
        <InputSheetProvider>
          <SplashPage
            splash={summarizeSplash(board, blocks, TZ, NOW)}
            blocks={blocks}
            photos={{}}
            lockedIds={[]}
            categories={LANES}
            timeZone={TZ}
            today={TODAY}
            initials="YL"
            poolTags={['Our Pool · 🎲 Games']}
          />
        </InputSheetProvider>
      </PeopleProvider>,
    );
    const header = container.querySelector('[data-splash-header]')!;
    const byline = header.querySelector('[data-splash-byline]')!;
    // After the date, inside the header (2026-10-29).
    const range = header.querySelector('[data-range]')!;
    expect(range.compareDocumentPosition(byline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(byline.querySelector('[data-splash-author]')?.getAttribute('data-splash-author')).toBe(
      'u-me',
    );
    // One line: the author at its start, the pool and its lane at its end.
    expect(byline.className).toContain('justify-between');
    expect(byline.lastElementChild?.querySelector('[data-origin-tag]')?.textContent).toBe(
      'Our Pool · 🎲 Games',
    );
    expect(container.querySelectorAll('[data-origin-tags]')).toHaveLength(1);
  });

  it('reads the blocks by their day inside the range under small day labels, photos full width', () => {
    const { container } = page();
    const ids = [...container.querySelectorAll('[data-block]')].map((b) =>
      b.getAttribute('data-block'),
    );
    expect(ids).toEqual(['first', 'night', 'later']);
    const labels = [...container.querySelectorAll('[data-block-date]')].map((l) => l.textContent);
    // Inside a range, a block reads by its day alone: no clock (0031).
    expect(labels[0]).toBe('Aug 17');
    expect(labels[2]).toBe('Aug 20');
    expect(container.querySelector('[data-block-body]')!.className).toMatch(/text-\[15px\]/);
    expect(container.querySelector('[data-photo]')!.className).toContain('w-full');
    expect(container.querySelector('[data-photo-placeholder]')).not.toBeNull();
  });

  it('threads the ripples: an avatar each, one line fewer than ripples, the body beside', () => {
    const { container } = page({ initials: 'YL' });
    const thread = container.querySelector('[data-blocks] [data-ripple-thread]')!;
    const avatars = thread.querySelectorAll('[data-thread-avatar]');
    expect(avatars).toHaveLength(3);
    expect(avatars[0].textContent).toBe('YL');
    expect(thread.querySelectorAll('[data-thread-line]')).toHaveLength(2);
    // The body sits in the column to the right of the avatar.
    const entry = thread.querySelector('[data-thread-entry="first"]')!;
    expect(entry.children[1].querySelector('[data-block="first"]')).not.toBeNull();
  });

  it('is two halves on a wide screen: the header left, the blocks right', () => {
    const { container } = page();
    const root = container.querySelector('[data-splash-page]')!;
    expect(root.className).toContain('lg:grid-cols-2');
    const side = container.querySelector('[data-splash-side]')!;
    const blocks = container.querySelector('[data-splash-blocks]')!;
    expect(side.querySelector('[data-splash-header]')).not.toBeNull();
    expect(blocks.querySelector('[data-blocks]')).not.toBeNull();
    expect(blocks.querySelector('[data-add-slot]')).not.toBeNull();
    expect(side.compareDocumentPosition(blocks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('never says thread, never fills a tag', () => {
    const { container } = page();
    expect(container.textContent).not.toMatch(/thread/i);
    for (const tag of container.querySelectorAll('[data-lane-tags] > span')) {
      expect(tag.className).not.toMatch(/bg-main-900|bg-ink/);
    }
  });
});

describe('writing on the page, in place', () => {
  it('puts the cursor in a tapped block, and Cancel puts it back', () => {
    const { container, getByText, getByLabelText } = page();
    fireEvent.click(container.querySelector('[data-block="night"]')!);
    const editor = container.querySelector('[data-block-editor="night"]')!;
    expect(editor).not.toBeNull();
    expect((getByLabelText('Block') as HTMLTextAreaElement).value).toBe('the village');
    expect(container.querySelector('[data-block="night"]')).toBeNull();
    fireEvent.click(getByText('Cancel'));
    expect(container.querySelector('[data-block-editor]')).toBeNull();
    expect(container.querySelector('[data-block="night"]')).not.toBeNull();
  });

  it('grows the field with its words rather than scrolling inside it', () => {
    const { container } = page();
    fireEvent.click(container.querySelector('[data-block="night"]')!);
    const field = container.querySelector<HTMLTextAreaElement>('[data-block-field]')!;
    expect(field.className).toContain('overflow-hidden');
    expect(field.className).toContain('resize-none');
  });

  it('saves a block’s words, photos and its day inside the range, never a lane (H24, 0031)', async () => {
    const { container, getByText, getByLabelText } = page();
    fireEvent.click(container.querySelector('[data-block="first"]')!);
    const editor = container.querySelector<HTMLElement>('[data-block-editor="first"]')!;
    expect(editor.querySelector('[role="group"][aria-label="Lane"]')).toBeNull();
    expect(within(editor).queryByText('+ Add Time')).toBeNull();
    // Its day, Aug 17, picked among the range's days only.
    const day = within(editor).getByLabelText('Day') as HTMLSelectElement;
    expect(day.value).toBe('2026-08-17');
    expect([...day.options].map((o) => o.textContent)).toEqual([
      'Aug 17',
      'Aug 18',
      'Aug 19',
      'Aug 20',
    ]);
    fireEvent.change(day, { target: { value: '2026-08-19' } });
    fireEvent.change(getByLabelText('Block'), { target: { value: 'sea to sky, fog' } });
    fireEvent.click(getByText('Save'));
    await waitFor(() => expect(calls.some((c) => c.name === 'editBlock')).toBe(true));
    expect(calls.find((c) => c.name === 'editBlock')!.args[0]).toEqual({
      id: 'first',
      note: 'sea to sky, fog',
      media: [],
      mediaMeta: {},
      occurredOn: '2026-08-19',
    });
    // editBlock revalidates: the page comes back in its response, not read twice.
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('opens with the next block’s editor up when opened to write (Board: "Add your side")', () => {
    const { container } = page({ writing: true });
    expect(container.querySelector('[data-block-editor="new"]')).not.toBeNull();
  });

  it('starts a new block on a range at its last day when today is past it, never a lane (0031)', async () => {
    const { container, getByText, getByLabelText } = page();
    fireEvent.click(getByText('Drop your words here'));
    await waitFor(() =>
      expect(container.querySelector('[data-block-editor="new"]')).not.toBeNull(),
    );
    const editor = container.querySelector<HTMLElement>('[data-block-editor="new"]')!;
    expect(editor.querySelector('[role="group"][aria-label="Lane"]')).toBeNull();
    // Today (Sep 25) is past Aug 17–20: the range's last day.
    expect((within(editor).getByLabelText('Day') as HTMLSelectElement).value).toBe('2026-08-20');
    fireEvent.change(getByLabelText('Block'), { target: { value: 'the drive home' } });
    fireEvent.click(getByText('Save'));
    await waitFor(() => expect(calls.some((c) => c.name === 'addBlock')).toBe(true));
    const added = calls.find((c) => c.name === 'addBlock')!.args[0];
    expect(added).toMatchObject({
      splashId: 's1',
      note: 'the drive home',
      media: [],
      occurredOn: '2026-08-20',
    });
    expect(added).not.toHaveProperty('categoryId');
  });

  it('offers no day on a one-day post: the block takes the post’s (H24)', async () => {
    const oneDay = { ...board, declared_end: null };
    const { container, getByText, getByLabelText } = page({
      splash: summarizeSplash(oneDay, blocks, TZ, NOW),
    });
    fireEvent.click(getByText('Drop your words here'));
    await waitFor(() =>
      expect(container.querySelector('[data-block-editor="new"]')).not.toBeNull(),
    );
    const editor = container.querySelector<HTMLElement>('[data-block-editor="new"]')!;
    expect(within(editor).queryByLabelText('Day')).toBeNull();
    fireEvent.change(getByLabelText('Block'), { target: { value: 'lunch' } });
    fireEvent.click(getByText('Save'));
    await waitFor(() => expect(calls.some((c) => c.name === 'addBlock')).toBe(true));
    expect(calls.find((c) => c.name === 'addBlock')!.args[0]).not.toHaveProperty('occurredOn');
  });

  it('on a one-day post widened into a range, shows a frozen day inside it and reads one outside as undated (0031)', () => {
    const widened = { ...board, declared_start: '2026-10-08', declared_end: '2026-10-12' };
    const frozen = [
      block({
        id: 'frozen-oct10',
        occurred_on: '2026-10-10',
        created_at: '2026-10-08T16:00:00.000Z',
      }),
      block({
        id: 'frozen-sep1',
        occurred_on: '2026-09-01',
        created_at: '2026-10-08T17:00:00.000Z',
      }),
    ];
    const { container } = page({
      splash: summarizeSplash(widened, frozen, TZ, NOW),
      blocks: frozen,
    });
    const ids = [...container.querySelectorAll('[data-block]')].map((b) =>
      b.getAttribute('data-block'),
    );
    expect(ids).toEqual(['frozen-sep1', 'frozen-oct10']);
    const labels = [...container.querySelectorAll('[data-block-date]')].map((l) => l.textContent);
    expect(labels).toEqual(['Oct 8', 'Oct 10']);
  });

  it('reads Oct 10 before Oct 12 inside a range, whatever order they were written in (0031)', () => {
    const range = { ...board, declared_start: '2026-10-08', declared_end: '2026-10-12' };
    const late = [
      block({ id: 'oct12', occurred_on: '2026-10-12', created_at: '2026-10-12T16:00:00.000Z' }),
      block({ id: 'oct10', occurred_on: '2026-10-10', created_at: '2026-10-13T16:00:00.000Z' }),
    ];
    const { container } = page({
      splash: summarizeSplash(range, late, TZ, NOW),
      blocks: late,
    });
    const ids = [...container.querySelectorAll('[data-block]')].map((b) =>
      b.getAttribute('data-block'),
    );
    expect(ids).toEqual(['oct10', 'oct12']);
  });

  it('carries the lock beside the block, and deletes a block behind a confirm', async () => {
    const { container, getByText } = page({ lockedIds: ['night'] });
    fireEvent.click(container.querySelector('[data-block="night"]')!);
    expect(getByText('Only me')).toBeTruthy();
    fireEvent.click(getByText('Only me'));
    await waitFor(() => expect(calls.some((c) => c.name === 'setRippleLock')).toBe(true));
    expect(calls.find((c) => c.name === 'setRippleLock')!.args).toEqual(['night', false]);

    fireEvent.click(getByText('Delete'));
    expect(getByText('Deletes this block')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-block-editor] .text-main-900')!);
    await waitFor(() => expect(calls.some((c) => c.name === 'deleteRipple')).toBe(true));
  });
});

describe('the header menu', () => {
  it('pins and unpins from the quiet menu', async () => {
    const { getByLabelText, getByText } = page();
    fireEvent.click(getByLabelText('More'));
    fireEvent.click(getByText('Pin'));
    await waitFor(() => expect(calls.some((c) => c.name === 'setSplashPinned')).toBe(true));
    expect(calls.find((c) => c.name === 'setSplashPinned')!.args).toEqual(['s1', true]);
  });

  it('says a delete takes the blocks with it (H21), then, outside a sheet, goes Home', async () => {
    const { getByLabelText, getByText, container } = page();
    fireEvent.click(getByLabelText('More'));
    fireEvent.click(getByText('Delete'));
    expect(container.querySelector('[data-delete-confirm]')!.textContent).toBe(
      'Deletes the post and its 3 blocks.',
    );
    fireEvent.click(container.querySelector('[role="alertdialog"] .text-main-900')!);
    await waitFor(() => expect(calls.some((c) => c.name === 'deleteSplash')).toBe(true));
    expect(router.push).toHaveBeenCalledWith('/');
    // Gone from every surface at once: the provider carries the id. Waited
    // for: the state lands a render after the action is called.
    await waitFor(() => expect(container.querySelector('[data-deleted]')!.textContent).toBe('s1'));
  });

  it('deletes a lone block’s post by deleting the block', async () => {
    const lone = block({ id: 'r-lone', note: 'alone', splash_id: null });
    const { getByLabelText, getByText, container } = page({
      splash: summarizeOrphan(lone, TZ, NOW),
      blocks: [lone],
    });
    fireEvent.click(getByLabelText('More'));
    fireEvent.click(getByText('Delete'));
    fireEvent.click(container.querySelector('[role="alertdialog"] .text-main-900')!);
    await waitFor(() => expect(calls.some((c) => c.name === 'deleteRipple')).toBe(true));
    expect(calls.find((c) => c.name === 'deleteRipple')!.args).toEqual(['r-lone']);
    expect(calls.some((c) => c.name === 'deleteSplash')).toBe(false);
  });

  it('edits the post\u2019s own icon in place, saving it with the header', async () => {
    const { getByLabelText } = page();
    fireEvent.change(getByLabelText('Icon'), { target: { value: '🏔️' } });
    await waitFor(() => expect(calls.some((c) => c.name === 'updateSplashHeader')).toBe(true));
    expect(calls.find((c) => c.name === 'updateSplashHeader')!.args[1]).toMatchObject({
      icon: '🏔️',
    });
  });

  it('edits the title in place', async () => {
    const { getByLabelText } = page();
    fireEvent.click(getByLabelText('Edit the title'));
    const input = getByLabelText('Title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Whistler, three nights' } });
    fireEvent.blur(input);
    await waitFor(() => expect(calls.some((c) => c.name === 'updateSplashHeader')).toBe(true));
    expect(calls.find((c) => c.name === 'updateSplashHeader')!.args).toEqual([
      's1',
      {
        title: 'Whistler, three nights',
        icon: null,
        declaredStart: '2026-08-17',
        declaredEnd: '2026-08-20',
        declaredLaneId: 'c-place',
      },
    ]);
  });
});

describe('a block read alone: its post is a joint splash of a pool I left (H23, H24)', () => {
  const lone = block({
    id: 'r-lone',
    note: 'coffee went cold while I read the whole thing',
    splash_id: null,
  });

  it('reads as one, with its first words as a ghost title', () => {
    const { container } = page({ splash: summarizeOrphan(lone, TZ, NOW), blocks: [lone] });
    expect(container.querySelector('[data-splash-title]')!.textContent).toBe(
      'coffee went cold while I read…',
    );
    expect(container.querySelectorAll('[data-block]')).toHaveLength(1);
  });

  it('is read, never written on: no add slot, no header to edit, no pin', () => {
    const { queryByText, queryByLabelText, container } = page({
      splash: summarizeOrphan(lone, TZ, NOW),
      blocks: [lone],
    });
    expect(queryByText('Drop your words here')).toBeNull();
    expect(container.querySelector('[data-add-slot]')).toBeNull();
    expect(queryByLabelText('Edit the title')).toBeNull();
  });
});

describe('my record’s sides, a tab per pool (0035)', () => {
  it('shows my ripples and the chosen pool’s members’, the off pool muted', () => {
    const theirs = [
      block({ id: 'side-a', author_id: 'u-mina', note: 'from Crew', thread_pool_id: 'p-crew' }),
      block({ id: 'side-b', author_id: 'u-jae', note: 'from Club', thread_pool_id: 'p-club' }),
    ];
    const { container, getByRole } = page({
      blocks: [...blocks, ...theirs],
      threads: [
        { poolId: 'p-crew', label: 'Crew', count: 1, off: false },
        { poolId: 'p-club', label: 'Club', count: 1, off: true },
      ],
      initialsOf: { 'u-mina': 'MI', 'u-jae': 'JA' },
    });
    const tabs = [...container.querySelectorAll('[data-thread-tab]')].map((t) => t.textContent);
    expect(tabs).toEqual(['All', 'Crew · 1', 'Club (off)']);
    expect(container.querySelector('[data-thread-tab="p-club"]')!.hasAttribute('data-off')).toBe(
      true,
    );
    const shown = () => container.querySelector('[data-blocks]')!.textContent ?? '';
    // All first and chosen: every pool's at once.
    expect(getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true');
    expect(shown()).toContain('from Crew');
    expect(shown()).toContain('from Club');
    // Underlined, never filled: the chosen one in ink with a line under it.
    const all = getByRole('tab', { name: 'All' });
    expect(all.className).not.toContain('bg-ink');
    expect(all.querySelector('span.bg-ink')).not.toBeNull();
    expect(getByRole('tab', { name: 'Crew · 1' }).querySelector('span.bg-ink')).toBeNull();
    fireEvent.click(getByRole('tab', { name: 'Crew · 1' }));
    expect(shown()).toContain('from Crew');
    expect(shown()).not.toContain('from Club');
    fireEvent.click(getByRole('tab', { name: 'Club (off)' }));
    expect(shown()).toContain('from Club');
    expect(shown()).not.toContain('from Crew');
  });
});

describe('a splash’s description (0037)', () => {
  /** The header's `…`, then its description item. */
  function fromMenu(container: HTMLElement, which: 'add' | 'hide'): void {
    fireEvent.click(container.querySelector('[data-splash-header] [aria-label="More"]')!);
    fireEvent.click(container.querySelector(`[data-description-toggle="${which}"]`)!);
  }

  it('is hidden until Add description in the header’s menu, then saves what was written when the field is left (review)', async () => {
    const { container } = page();
    // No field and no "+ Add description" standing in the page.
    expect(container.querySelector('[data-splash-description-block]')).toBeNull();
    expect(container.textContent).not.toContain('Add description');
    fromMenu(container, 'add');
    const field = container.querySelector<HTMLTextAreaElement>('[data-splash-description-field]')!;
    // Open, in focus, its placeholder faint.
    expect(document.activeElement).toBe(field);
    expect(field.className).toContain('placeholder:opacity-30');
    fireEvent.change(field, { target: { value: '  A weekend in Whistler.  ' } });
    // Set apart from the ripples by a divider.
    expect(container.querySelector('[data-splash-description-block]')!.className).toContain(
      'border-b',
    );
    fireEvent.blur(field);
    await waitFor(() =>
      expect(calls.find((c) => c.name === 'setSplashDescription')?.args).toEqual([
        board.id,
        'A weekend in Whistler.',
      ]),
    );
  });

  it('hides an empty field again from the menu, or when left with no words', () => {
    const { container } = page();
    fromMenu(container, 'add');
    expect(container.querySelector('[data-splash-description-field]')).not.toBeNull();
    fromMenu(container, 'hide');
    expect(container.querySelector('[data-splash-description-block]')).toBeNull();
    fromMenu(container, 'add');
    fireEvent.blur(container.querySelector('[data-splash-description-field]')!);
    expect(container.querySelector('[data-splash-description-block]')).toBeNull();
    // The menu says Add again.
    fireEvent.click(container.querySelector('[data-splash-header] [aria-label="More"]')!);
    expect(container.querySelector('[data-description-toggle="add"]')).not.toBeNull();
    expect(calls.some((c) => c.name === 'setSplashDescription')).toBe(false);
  });

  it('shows one that has words, and Hide description takes it off', async () => {
    const { container } = page({
      splash: { ...summarizeSplash(board, blocks, TZ, NOW), description: 'Kept' },
    });
    expect(container.querySelector('[data-splash-description]')!.textContent).toBe('Kept');
    fromMenu(container, 'hide');
    expect(container.querySelector('[data-splash-description-block]')).toBeNull();
    await waitFor(() =>
      expect(calls.find((c) => c.name === 'setSplashDescription')?.args).toEqual([board.id, '']),
    );
  });

  it('keeps what was there on Escape, and shows nothing to a reader when there is none', () => {
    const { container, unmount } = page({
      splash: { ...summarizeSplash(board, blocks, TZ, NOW), description: 'Kept' },
    });
    fireEvent.click(container.querySelector('[data-splash-description]')!);
    const field = container.querySelector<HTMLTextAreaElement>('[data-splash-description-field]')!;
    fireEvent.change(field, { target: { value: 'Changed' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(container.querySelector('[data-splash-description]')!.textContent).toBe('Kept');
    expect(calls.some((c) => c.name === 'setSplashDescription')).toBe(false);
    unmount();
    const reader = page({
      pool: {
        poolId: 'p-1',
        me: 'someone-else',
        scope: 'theirs',
        initialsOf: {},
        laneChip: null,
        canDeleteJoint: false,
        zoneOf: {},
      },
    });
    expect(reader.container.querySelector('[data-splash-description-block]')).toBeNull();
    // Nor a menu item to add one.
    expect(reader.container.querySelector('[data-description-toggle]')).toBeNull();
  });
});

describe('the dot for what others left on my block (H25)', () => {
  it('goes when I tap that block’s reactions, without waiting for the next open', async () => {
    window.localStorage.clear();
    const { container } = render(
      <PeopleProvider me="a1" people={{ a1: { name: 'Yoonji', photo: null } }}>
        <InputSheetProvider>
          <SplashPage
            splash={summarizeSplash(board, blocks, TZ, NOW)}
            blocks={blocks}
            photos={{}}
            lockedIds={[]}
            categories={LANES}
            timeZone={TZ}
            today={TODAY}
            respondable
            responses={{
              reactions: [
                {
                  ripple_id: 'first',
                  user_id: 'u-friend',
                  emoji: '🙏',
                  created_at: '2026-09-25T19:00:00.000Z',
                  thread_pool_id: null,
                },
              ],
              replies: [],
            }}
          />
        </InputSheetProvider>
      </PeopleProvider>,
    );
    await waitFor(() =>
      expect(container.querySelectorAll('[data-responses-unseen]')).toHaveLength(1),
    );
    fireEvent.pointerDown(
      container.querySelector('[data-ripple-responses="first"] [data-reaction]')!,
    );
    expect(container.querySelector('[data-responses-unseen]')).toBeNull();
  });
});
