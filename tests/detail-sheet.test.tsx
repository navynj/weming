// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/media', () => ({ signRippleMedia: () => Promise.resolve([]) }));
const locks: boolean[] = [];
vi.mock('@/features/ripple-sheet/actions', () => ({
  deleteRipple: () => Promise.resolve({ ok: true, rippleId: 'r' }),
  setRippleLock: (_id: string, locked: boolean) => {
    locks.push(locked);
    return Promise.resolve({ ok: true, rippleId: 'r' });
  },
}));

import { DetailSheet } from '@/features/ripple-sheet/detail-sheet';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import { written } from './written-on';

const TZ = 'America/Vancouver';
const TODAY = '2026-09-19';

afterEach(cleanup);

function ripple(over: Partial<RippleWithSplash> = {}): RippleWithSplash {
  return written({
    id: 'r1',
    author_id: 'a1',
    thread_pool_id: null,
    video_previews: true,
    note: 'kitsilano beach',
    media: [],
    occurred_on: null,
    occurred_time: null,
    started_at: null,
    ended_at: null,
    planned: false,
    participants: [],
    created_at: '2026-09-19T16:00:00.000Z',
    parent_ripple_id: null,
    splash_id: null,
    ...over,
  });
}

function sheet(props: Partial<Parameters<typeof DetailSheet>[0]> = {}) {
  return render(
    <DetailSheet
      ripple={ripple()}
      locked={false}
      splashTitle={null}
      timeZone={TZ}
      today={TODAY}
      onClose={() => {}}
      onEdit={() => {}}
      {...props}
    />,
  );
}

describe('the detail sheet reads the record', () => {
  it('says a plain fragment was posted, and names an annotation when there is one', () => {
    const plain = sheet();
    expect(plain.container.querySelector('[data-annotation]')!.textContent).toBe('Posted');
    cleanup();

    const placed = sheet({
      ripple: ripple({ occurred_on: '2026-08-17', occurred_time: '14:30:00' }),
    });
    expect(placed.container.querySelector('[data-annotation]')!.textContent).toBe('8. 17 14:30');
  });

  it('names the board the fragment belongs to', () => {
    const { getByText } = sheet({ ripple: ripple({ splash_id: 's1' }), splashTitle: 'Whistler' });
    expect(getByText('· Whistler')).toBeTruthy();
  });

  it('shows a span its duration, and a point nothing', () => {
    const { container } = sheet({
      ripple: ripple({
        occurred_on: '2026-09-19',
        occurred_time: '19:00:00',
        started_at: '2026-09-20T02:00:00.000Z',
        ended_at: '2026-09-20T04:00:00.000Z',
      }),
    });
    expect(container.textContent).toContain('2h');
  });
});

describe('the lock lives here (H20g)', () => {
  it('toggles between Everyone and Only me, writing the state', async () => {
    locks.length = 0;
    const { getByText } = sheet();

    // The label flips inside the transition, a commit before `pending`
    // clears and the button re-enables; a click in that gap is dropped. So
    // each step waits for the settled button, label and enabled both.
    const settled = (label: string) =>
      waitFor(() => {
        const button = getByText(label).closest('button')!;
        expect(button.disabled).toBe(false);
        return button;
      });

    fireEvent.click(await settled('Everyone'));
    await settled('Only me');
    expect(locks).toEqual([true]);

    fireEvent.click(await settled('Only me'));
    await settled('Everyone');
    expect(locks).toEqual([true, false]);
  });

  it('opens locked when the record is', () => {
    const { getByText } = sheet({ locked: true });
    expect(getByText('Only me')).toBeTruthy();
  });
});

describe('what is not here', () => {
  it('has no view count: counting needs an audience (P2)', () => {
    const { container } = sheet();
    expect(container.textContent).not.toMatch(/view|seen by/i);
  });

  it('offers no way into a session: inner composition is dormant (H20b)', () => {
    const { container } = sheet({
      ripple: ripple({
        occurred_on: '2026-09-19',
        occurred_time: '09:00:00',
        started_at: '2026-09-19T16:00:00.000Z',
        ended_at: '2026-09-19T18:00:00.000Z',
      }),
    });
    expect(container.textContent).not.toMatch(/this session/i);
  });

  it('confirms a delete as one record, nothing inside it', () => {
    const { getByText } = sheet();
    fireEvent.click(getByText('Delete'));
    expect(getByText('Deletes this record')).toBeTruthy();
  });
});
