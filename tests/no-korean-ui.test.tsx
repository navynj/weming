// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/pool/new',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));
vi.mock('@/features/pool/actions', () => ({}));
vi.mock('@/features/lanes/actions', () => ({}));

import { CreateFlow } from '@/features/pool/create-flow';
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
    const lanes = [
      { id: 'c1', name: 'Food', icon: '🍽️' },
      { id: 'c2', name: 'Day', icon: '🖋' },
    ];
    const create = render(
      <CreateFlow
        categories={lanes.map((l, position) => ({
          ...l,
          user_id: 'u',
          default_mode: 'drop' as const,
          position,
          created_at: '2026-01-01T00:00:00Z',
        }))}
      />,
    );
    expect(create.container.textContent).not.toMatch(HANGUL);
    // The kind is no longer asked (2026-10-23).
    expect(create.container.textContent).not.toMatch(/What kind of Pool/);
    expect(create.container.querySelector('[data-pool-kind]')).toBeNull();
    cleanup();
    const join = render(
      <JoinFlow token="t" poolName="Our Pool" initials={['YL', 'MI']} myName="Yoonji" />,
    );
    expect(join.container.textContent).not.toMatch(HANGUL);
  });
});
