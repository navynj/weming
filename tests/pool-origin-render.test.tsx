// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/pool/p/settings',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));
const deleted: string[] = [];
vi.mock('@/features/pool/actions', () => ({
  deletePool: (id: string) => {
    deleted.push(id);
    return Promise.resolve({ ok: true });
  },
}));

import { CardFace } from '@/features/home/card-face';
import { placeCard } from '@/features/home/grid';
import { DeletePool } from '@/features/pool/delete-pool';
import { originTag } from '@/features/pool/origin-tag';
import type { SplashSummary } from '@/features/splash/summary';

afterEach(cleanup);

const SUMMARY = {
  id: 's',
  title: 'Arnak league',
  ghostTitle: null,
  description: null,
  declaredLaneId: null,
  icon: null,
  laneIds: [],
  declaredRange: null,
  range: { start: '2026-10-22', end: '2026-10-22' },
  count: 1,
  blocks: [],
  latestCreatedAt: '2026-10-22T18:00:00Z',
  writtenOn: '2026-10-22',
  ownPoolId: null,
  open: true,
  createdAt: '2026-10-22T18:00:00Z',
  pinnedAt: null,
  sessionId: null,
  orphan: false,
} satisfies SplashSummary;

describe('the origin tag (0015)', () => {
  it('reads "<Pool> · <emoji> <pool lane>"', () => {
    expect(originTag('Our Pool', '🎲', 'Games')).toBe('Our Pool · 🎲 Games');
    expect(originTag('Our Pool', null, 'Games')).toBe('Our Pool · Games');
  });

  it('shows on the card, one per pool', () => {
    const card = {
      ...placeCard(SUMMARY, 'words', 'UTC'),
      origins: ['Our Pool · 🎲 Games', 'Crew · 📍 Place'],
    };
    const { container } = render(<CardFace card={card} lane={null} initials="YL" edge="full" />);
    const tags = [...container.querySelectorAll('[data-origin-tag]')].map((t) => t.textContent);
    expect(tags).toEqual(['Our Pool · 🎲 Games', 'Crew · 📍 Place']);
  });
});

describe('Delete Pool (0015)', () => {
  it('stays shut until the pool’s name is typed exactly', () => {
    const view = render(<DeletePool poolId="p" poolName="Our Pool" />);
    fireEvent.click(view.getByText('Delete Pool'));
    expect(view.getByText('Delete Our Pool for everyone?')).toBeTruthy();
    expect(
      view.getByText(/Joint splashes go back to each writer as their own records\./),
    ).toBeTruthy();
    const confirm = view.container.ownerDocument.querySelector(
      '[data-delete-pool-confirm]',
    ) as HTMLButtonElement;
    const field = view.container.ownerDocument.querySelector(
      '[data-delete-pool-name]',
    ) as HTMLInputElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'our pool' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'Our Pool' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(deleted).toEqual(['p']);
  });
});
