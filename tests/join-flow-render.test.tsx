// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Joining asks nothing about lanes (hotfix 2026-10-26): a new account opens
 * an invite and lands on the pool — no matching step, every pool lane
 * unconnected. A name is global (H60): shown, not asked, unless the profile
 * has none.
 */
const { replaced, joined, saved } = vi.hoisted(() => ({
  replaced: [] as string[],
  joined: [] as unknown[],
  saved: [] as unknown[],
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
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
  requestAvatarUpload: () => Promise.resolve({ ok: false, message: 'not in tests' }),
}));

import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { PeopleProvider } from '@/features/people/people-provider';
import { JoinFlow } from '@/features/pool/join-flow';

afterEach(() => {
  cleanup();
  replaced.length = 0;
  joined.length = 0;
  saved.length = 0;
});

function invite(myName = 'Sora Kim') {
  return render(
    <PeopleProvider me="u-me" people={{ 'u-me': { name: myName, photo: null } }}>
      <InputSheetProvider>
        <JoinFlow
          token="t-invite"
          poolName="Our Pool"
          members={[
            { name: 'Yoonji Lee', photo: 'https://x/y.jpg' },
            { name: 'Mina', photo: null },
          ]}
          myName={myName}
        />
      </InputSheetProvider>
    </PeopleProvider>,
  );
}

describe('joining a pool asks nothing about lanes (hotfix)', () => {
  it('a new account opens an invite and lands on the pool as the name it has', async () => {
    const view = invite();
    // One screen: no step count, no matching, no word "lane".
    expect(view.container.querySelector('[data-step]')).toBeNull();
    expect(view.container.querySelector('[data-match]')).toBeNull();
    expect(view.container.textContent!.toLowerCase()).not.toMatch(/\blanes?\b/);
    // No name to edit: the one I join as, shown (H60).
    expect(view.container.querySelector('[data-join-name]')).toBeNull();
    expect(view.container.querySelector('[data-join-as-name]')?.textContent).toBe('Sora Kim');
    fireEvent.click(view.getByText('Join'));
    await waitFor(() => expect(replaced).toEqual(['/pool/p-ours?welcome=1']));
    // Just the invite: no name, no links, no earlier records.
    expect(joined).toEqual([{ token: 't-invite' }]);
    expect(saved).toEqual([]);
  });

  it('opens my profile from "Change in Settings", over the invite', () => {
    const view = invite();
    expect(document.querySelector('[data-profile-sheet]')).toBeNull();
    fireEvent.click(view.getByText('Change in Settings'));
    expect(document.querySelector('[data-profile-sheet]')).not.toBeNull();
  });

  it('asks a profile with no name for one, as its name everywhere, and sends it', async () => {
    const view = invite('  ');
    const field = view.container.querySelector('[data-join-name]') as HTMLInputElement;
    expect(field.required).toBe(true);
    expect(field.closest('label')?.textContent).toContain('Your name (shown in all your pools)');
    expect((view.getByText('Join').closest('button') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: ' Sora ' } });
    fireEvent.click(view.getByText('Join'));
    await waitFor(() => expect(replaced).toEqual(['/pool/p-ours?welcome=1']));
    expect(joined).toEqual([{ token: 't-invite', name: 'Sora' }]);
    expect(saved).toEqual([]);
  });

  it('names the place, and shows each member as a face and a name (0067)', () => {
    const { container } = invite();
    expect(container.querySelector('[data-step-title]')?.textContent).toBe('Join Pool');
    const members = [...container.querySelectorAll('[data-invite-member]')];
    expect(members.map((m) => m.querySelector('[data-invite-member-name]')?.textContent)).toEqual([
      'Yoonji Lee',
      'Mina',
    ]);
    expect(members[0].querySelector('img')?.getAttribute('src')).toBe('https://x/y.jpg');
    // No photo: the initials in its place.
    expect(members[1].querySelector('img')).toBeNull();
    expect(members[1].textContent).toContain('MI');
  });
});
