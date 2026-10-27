// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/pool/p-a/settings',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const renamed: [string, string][] = [];
const invitedAll: [string, boolean][] = [];
vi.mock('@/features/pool/actions', () => ({
  renamePool: (poolId: string, name: string) => {
    renamed.push([poolId, name]);
    return Promise.resolve({ ok: true });
  },
  setLaneLinks: () => Promise.resolve({ ok: true }),
  setPoolInviteAll: (poolId: string, on: boolean) => {
    invitedAll.push([poolId, on]);
    return Promise.resolve({ ok: true });
  },
  createInvite: () => Promise.resolve({ ok: false, message: 'not in tests' }),
  revokeInvite: () => Promise.resolve({ ok: true }),
  deletePool: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/features/lanes/actions', () => ({ saveLane: () => Promise.resolve({ ok: true }) }));

import { PoolSettings } from '@/features/pool/settings';
import type { PoolView } from '@/lib/queries/pools';

afterEach(() => {
  cleanup();
  renamed.length = 0;
  invitedAll.length = 0;
});

const view = (ownerId: string, inviteAllByDefault = false): PoolView => ({
  pool: { id: 'p-a', name: 'Our Pool', ownerId, inviteAllByDefault },
  members: [],
  lanes: [],
  myLinks: [],
  placements: [],
  splashes: [],
  ripples: [],
  invites: [],
});

describe('renaming the pool in settings (0021)', () => {
  it('is offered to its creator, shows at once, and saves trimmed', async () => {
    const { container, getByLabelText } = render(
      <PoolSettings view={view('u-me')} categories={[]} me="u-me" />,
    );
    const save = container.querySelector<HTMLButtonElement>('[data-save-name]')!;
    expect(save.disabled).toBe(true);
    fireEvent.change(getByLabelText('Pool name'), { target: { value: '  Sarang  ' } });
    fireEvent.click(save);
    expect(container.textContent).toContain('Sarang');
    await waitFor(() => expect(renamed).toEqual([['p-a', 'Sarang']]));
  });

  it('is not offered to any other member', () => {
    const { container } = render(<PoolSettings view={view('u-other')} categories={[]} me="u-me" />);
    expect(container.querySelector('[data-settings-name]')).toBeNull();
  });
});

describe('inviting everyone to new posts by default (0033)', () => {
  const toggle = (root: HTMLElement) =>
    root.querySelector('[data-settings-invite-all] [role="switch"]') as HTMLButtonElement;

  it('starts as the pool has it, and saves a flip at once', async () => {
    const { container } = render(<PoolSettings view={view('u-other')} categories={[]} me="u-me" />);
    expect(container.textContent).toContain('Invite everyone to new posts by default');
    expect(toggle(container).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle(container));
    expect(toggle(container).getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(invitedAll).toEqual([['p-a', true]]));
  });

  it('turns off a pool that has it on', async () => {
    const { container } = render(
      <PoolSettings view={view('u-me', true)} categories={[]} me="u-me" />,
    );
    expect(toggle(container).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle(container));
    expect(toggle(container).getAttribute('aria-checked')).toBe('false');
    await waitFor(() => expect(invitedAll).toEqual([['p-a', false]]));
  });
});

describe('Connect your lanes, under Advanced (0033)', () => {
  it('stays folded until Advanced is opened', () => {
    const { container } = render(<PoolSettings view={view('u-me')} categories={[]} me="u-me" />);
    const advanced = container.querySelector<HTMLButtonElement>('[data-settings-advanced-toggle]')!;
    expect(advanced.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-lane-match]')).toBeNull();
    fireEvent.click(advanced);
    expect(advanced.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-lane-match]')!.textContent).toContain(
      'Connect your lanes',
    );
  });
});
