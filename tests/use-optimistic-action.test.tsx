// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh }),
}));

import { useOptimisticAction, type ActionOutcome } from '@/lib/use-optimistic-action';

// Every edit is optimistic (CLAUDE.md, the principle), and one write is one
// render: the action's own response carries the page (2026-10-28), so the
// hook never reads it again.
describe('an optimistic write', () => {
  function pending(): { promise: Promise<ActionOutcome>; settle: (o: ActionOutcome) => void } {
    let settle!: (o: ActionOutcome) => void;
    const promise = new Promise<ActionOutcome>((resolve) => (settle = resolve));
    return { promise, settle };
  }

  it('shows the change at once, holds it while the action runs, and never refreshes', async () => {
    const { result } = renderHook(() => useOptimisticAction(['a']));
    const action = pending();
    act(() =>
      result.current.run(
        (v) => [...v, 'b'],
        () => action.promise,
      ),
    );
    expect(result.current.value).toEqual(['a', 'b']);
    expect(result.current.pending).toBe(true);
    await act(async () => action.settle({ ok: true }));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.message).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('takes the change back and says why when the action refuses', async () => {
    const { result } = renderHook(() => useOptimisticAction(['a']));
    const action = pending();
    act(() =>
      result.current.run(
        (v) => [...v, 'b'],
        () => action.promise,
      ),
    );
    expect(result.current.value).toEqual(['a', 'b']);
    await act(async () => action.settle({ ok: false, message: 'Others have written here.' }));
    await waitFor(() => expect(result.current.value).toEqual(['a']));
    expect(result.current.message).toBe('Others have written here.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
