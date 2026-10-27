// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Joining asks nothing about lanes (hotfix 2026-10-26): a new account opens
 * an invite, enters a name, and lands on the pool — no matching step, every
 * pool lane unconnected.
 */
const { replaced, joined, saved } = vi.hoisted(() => ({
  replaced: [] as string[],
  joined: [] as unknown[],
  saved: [] as unknown[],
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/join/t',
  useRouter: () => ({
    push: () => {},
    replace: (to: string) => replaced.push(to),
    back: () => {},
    refresh: () => {},
  }),
}));
vi.mock('@/features/pool/actions', () => ({
  joinPool: (input: unknown) => {
    joined.push(input);
    return Promise.resolve({ ok: true, id: 'p-ours' });
  },
}));
vi.mock('@/features/people/actions', () => ({
  saveProfile: (input: unknown) => {
    saved.push(input);
    return Promise.resolve({ ok: true });
  },
}));

import { JoinFlow } from '@/features/pool/join-flow';

afterEach(() => {
  cleanup();
  replaced.length = 0;
  joined.length = 0;
  saved.length = 0;
});

function invite(myName = 'kakao user 1234') {
  return render(
    <JoinFlow token="t-invite" poolName="Our Pool" initials={['YL', 'MI']} myName={myName} />,
  );
}

describe('joining a pool asks nothing about lanes (hotfix)', () => {
  it('a new account opens an invite, enters a name, and lands on the pool', async () => {
    const view = invite();
    // One screen: no step count, no matching, no word "lane".
    expect(view.container.querySelector('[data-step]')).toBeNull();
    expect(view.container.querySelector('[data-match]')).toBeNull();
    expect(view.container.textContent!.toLowerCase()).not.toMatch(/\blanes?\b/);
    fireEvent.change(view.container.querySelector('[data-join-name]')!, {
      target: { value: 'Yoonji' },
    });
    fireEvent.click(view.getByText('Join'));
    await waitFor(() => expect(replaced).toEqual(['/pool/p-ours']));
    expect(saved).toEqual([{ name: 'Yoonji', photo: 'keep' }]);
    // Just the invite: no links, no earlier records — links are advanced only.
    expect(joined).toEqual([{ token: 't-invite' }]);
  });

  it('keeps a name that is already there, and needs one to join', async () => {
    const view = invite('Mina');
    fireEvent.click(view.getByText('Join'));
    await waitFor(() => expect(replaced).toEqual(['/pool/p-ours']));
    expect(saved).toEqual([]);
    cleanup();
    const empty = invite('');
    expect((empty.getByText('Join').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
