// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/pool/new',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));
vi.mock('@/features/pool/actions', () => ({}));
vi.mock('@/features/lanes/actions', () => ({}));

import { CreateFlow } from '@/features/pool/create-flow';
import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { JoinFlow } from '@/features/pool/join-flow';

/**
 * Every word on screen is English (H23). The mockups carry Korean copy as
 * layout reference only; none of it may reach the UI. Two nets: every
 * source file that can render, and the pool screens as rendered.
 */
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

afterEach(cleanup);

describe('no Korean in the UI (H23)', () => {
  it('appears in no source that renders', () => {
    const offenders = ['app', 'features', 'components', 'lib']
      .flatMap(sources)
      .filter((path) => HANGUL.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('appears on no rendered pool screen', () => {
    const create = render(<CreateFlow />);
    expect(create.container.textContent).not.toMatch(HANGUL);
    // The kind is no longer asked (2026-10-23).
    expect(create.container.textContent).not.toMatch(/What kind of Pool/);
    expect(create.container.querySelector('[data-pool-kind]')).toBeNull();
    cleanup();
    const join = render(
      <InputSheetProvider>
        <JoinFlow
          token="t"
          poolName="Our Pool"
          members={[
            { name: 'Yoonji Lee', photo: 'https://x/y.jpg' },
            { name: 'Mina', photo: null },
          ]}
          myName="Yoonji"
        />
      </InputSheetProvider>,
    );
    expect(join.container.textContent).not.toMatch(HANGUL);
  });
});
