// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { SettingsSheet } from '@/features/settings/settings-sheet';

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
afterEach(cleanup);

/** Log out sits where a pool's settings has it, on Home's too (2026-10-29). */
describe('the heading of Home’s settings', () => {
  it('ends in the same small Log out', () => {
    window.history.replaceState(null, '', '/?settings=home');
    render(
      <InputSheetProvider>
        <SettingsSheet
          title="Settings"
          tabs={[{ key: 'home', label: 'Home', render: () => <p>lanes</p> }]}
        />
      </InputSheetProvider>,
    );
    const out = document.querySelector('[data-sign-out]')!;
    expect(out.textContent).toBe('Log out');
    const form = out.closest('form')!;
    expect(form.getAttribute('action')).toBe('/auth/sign-out');
    expect(form.getAttribute('method')).toBe('post');
    expect(form.parentElement?.querySelector('h2')?.textContent).toBe('Settings');
  });
});
