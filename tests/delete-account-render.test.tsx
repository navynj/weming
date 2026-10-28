import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The confirm sheet (H53): what goes, what stays, the pools, the backups, the checks. */

const state = vi.hoisted(() => ({ recent: true, query: '' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.query),
}));
vi.mock('@/features/auth/sign-in-button', () => ({
  SignInButton: ({ next }: { next: string }) => <button data-sign-in-again={next}>Sign in</button>,
}));
const deleteMyAccount = vi.fn<(typed: string) => Promise<{ ok: false; message: string }>>(
  async () => ({
    ok: false as const,
    message: 'not in tests',
  }),
);
vi.mock('@/features/account/actions', () => ({
  previewAccountDeletion: async () => ({
    ok: true,
    preview: {
      recent: state.recent,
      records: 3,
      ripples: 7,
      replies: 2,
      reactions: 1,
      photos: 4,
      lanes: 5,
      pools: [
        { poolId: 'p-crew', name: 'Crew', heirId: 'u-ben', heirName: 'Ben' },
        { poolId: 'p-solo', name: 'Solo', heirId: null, heirName: null },
      ],
    },
  }),
  deleteMyAccount: (typed: string) => deleteMyAccount(typed),
}));

import { DeleteAccount } from '@/features/account/delete-account';

afterEach(() => {
  cleanup();
  state.recent = true;
  state.query = '';
});

describe('Delete my account', () => {
  it('lists what goes, what stays, each pool’s fate and the backups, then asks for the word', async () => {
    const { container, getByText } = render(<DeleteAccount />);
    fireEvent.click(getByText('Delete my account'));
    await waitFor(() =>
      expect(container.querySelector('[data-delete-account-preview]')).not.toBeNull(),
    );
    expect(getByText(/Your records \(3\)/)).toBeTruthy();
    expect(getByText('Crew: Ben becomes the owner')).toBeTruthy();
    expect(getByText('Solo: deleted, since you’re its only member')).toBeTruthy();
    expect(
      getByText('Encrypted backups keep a copy for up to 60 days, then it’s gone.'),
    ).toBeTruthy();

    const confirm = container.querySelector<HTMLButtonElement>('[data-delete-account-confirm]')!;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(container.querySelector('[data-delete-account-word]')!, {
      target: { value: 'delete' },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(deleteMyAccount).toHaveBeenCalledWith('delete'));
    await waitFor(() => expect(getByText('not in tests')).toBeTruthy());
  });

  it('asks for a fresh sign-in that comes back to this sheet, and offers no confirm', async () => {
    state.recent = false;
    const { container, getByText } = render(<DeleteAccount />);
    fireEvent.click(getByText('Delete my account'));
    await waitFor(() => expect(container.querySelector('[data-sign-in-again]')).not.toBeNull());
    expect(
      container.querySelector('[data-sign-in-again]')!.getAttribute('data-sign-in-again'),
    ).toBe('/?settings=home&delete=1');
    expect(container.querySelector('[data-delete-account-confirm]')).toBeNull();
  });

  it('opens by itself on the way back from signing in', async () => {
    state.query = 'settings=home&delete=1';
    const { container } = render(<DeleteAccount />);
    await waitFor(() =>
      expect(container.querySelector('[data-delete-account-preview]')).not.toBeNull(),
    );
  });
});
