// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const sent = vi.hoisted(() => [] as unknown[]);
vi.mock('@/features/responses/actions', () => ({
  addReply: (input: unknown) => (sent.push(input), Promise.resolve({ ok: true })),
  setReaction: (input: unknown) => (sent.push(input), Promise.resolve({ ok: true })),
  editReply: () => Promise.resolve({ ok: true }),
  deleteReply: () => Promise.resolve({ ok: true }),
  hideReply: () => Promise.resolve({ ok: true }),
}));

import { PeopleProvider } from '@/features/people/people-provider';
import { useRippleResponses } from '@/features/responses/use-ripple-responses';

const wrapper = ({ children }: { children: ReactNode }) => (
  <PeopleProvider me="u-me" people={{}}>
    {children}
  </PeopleProvider>
);

describe('a response is written into the pool it is made in (0053)', () => {
  it('sends the pool shown with a reply and a reaction', async () => {
    const { result } = renderHook(() => useRippleResponses({ reactions: [], replies: [] }, 'p-a'), {
      wrapper,
    });
    await act(async () => {
      result.current.handlers('r1').reply('hello');
      result.current.react('r1', '❤️');
    });
    expect(sent).toEqual([
      expect.objectContaining({ rippleId: 'r1', body: 'hello', poolId: 'p-a' }),
      expect.objectContaining({ rippleId: 'r1', emoji: '❤️', on: true, poolId: 'p-a' }),
    ]);
  });
});
