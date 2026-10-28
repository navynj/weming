// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/pool/new',
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
}));
const { created } = vi.hoisted(() => ({ created: [] as unknown[] }));
vi.mock('@/features/pool/actions', () => ({
  createPool: (input: unknown) => {
    created.push(input);
    return Promise.resolve({ ok: true, id: 'p-new' });
  },
}));
vi.mock('@/features/lanes/actions', () => ({
  saveLane: () => Promise.resolve({ ok: true, id: 'c-made' }),
}));

import { CreateFlow } from '@/features/pool/create-flow';

afterEach(cleanup);

function addLane(root: HTMLElement, name: string): void {
  // With no lanes yet the editor's form is already open; after that, + Add lane.
  const add = root.querySelector('[data-add-lane]');
  if (add) fireEvent.click(add);
  fireEvent.change(root.querySelector('[aria-label="Lane name"]')!, { target: { value: name } });
  fireEvent.click(root.querySelector('[data-save-lane]')!);
}

const button = (root: HTMLElement) =>
  root.querySelector('[data-create-step="1"] [data-primary]') as HTMLButtonElement;

describe('opening a new pool (review)', () => {
  it('is one screen: name, photo and lanes, with no lane matching and no step 2', () => {
    const { container } = render(<CreateFlow />);
    expect(container.querySelector('[data-create-step="1"]')).not.toBeNull();
    expect(container.querySelector('[data-create-step="2"]')).toBeNull();
    expect(container.querySelector('[data-match-select]')).toBeNull();
    expect(container.querySelector('[data-create-connect]')).toBeNull();
    expect(container.querySelector('[data-pool-name]')).not.toBeNull();
    expect(container.querySelector('[data-pool-photo-field]')).not.toBeNull();
  });

  it('opens the pool only once it has a name and a lane', () => {
    const { container } = render(<CreateFlow />);
    expect(button(container).disabled).toBe(true);
    fireEvent.change(container.querySelector('[data-pool-name]')!, { target: { value: 'Sarang' } });
    expect(button(container).disabled).toBe(true);
    addLane(container, 'Trips');
    expect(button(container).disabled).toBe(false);
    expect(button(container).textContent).toBe('Open the Pool');
  });

  it('sends the name and the pool lanes only: no lane of mine, no earlier records', async () => {
    created.length = 0;
    const { container } = render(<CreateFlow />);
    fireEvent.change(container.querySelector('[data-pool-name]')!, {
      target: { value: '  Sarang ' },
    });
    addLane(container, 'Trips');
    fireEvent.click(button(container));
    await waitFor(() => expect(created).toHaveLength(1));
    const input = created[0] as {
      name: string;
      lanes: { name: string; icon: string | null; description: string | null }[];
    };
    expect(input.name).toBe('Sarang');
    expect(Object.keys(input).sort()).toEqual(['lanes', 'name']);
    expect(input.lanes).toHaveLength(1);
    expect(input.lanes[0].name).toBe('Trips');
    expect(Object.keys(input.lanes[0]).sort()).toEqual(['description', 'icon', 'name']);
  });
});
