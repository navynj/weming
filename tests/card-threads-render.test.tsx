// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PeopleProvider } from '@/features/people/people-provider';
import { CardResponses } from '@/features/responses/card-responses';
import type { RippleResponsesValue } from '@/features/responses/model';

afterEach(cleanup);

const ME = 'u-me';
const VALUE: RippleResponsesValue = {
  reactions: [
    {
      ripple_id: 'r1',
      user_id: 'u-a',
      emoji: '❤️',
      created_at: '2026-10-27T01:00:00Z',
      thread_pool_id: 'p-church',
    },
  ],
  replies: [
    {
      id: 'x',
      ripple_id: 'r1',
      author_id: 'u-b',
      body: 'from the book club',
      created_at: '2026-10-27T02:00:00Z',
      edited_at: null,
      hidden: false,
      former: false,
      thread_pool_id: 'p-book',
    },
  ],
};

const card = (labels?: { owner: string; pools: Record<string, string> }) =>
  render(
    <PeopleProvider me={ME} people={{}}>
      <CardResponses
        rippleId="r1"
        value={VALUE}
        canReact
        href="/splash/s1"
        onReact={() => {}}
        labels={labels}
      />
    </PeopleProvider>,
  );

describe('the owner’s Home card labels each thread with its pool (0053)', () => {
  it('says where each reaction group and reply came from; I react in my own, from no pool', () => {
    const { container } = card({
      owner: ME,
      pools: { 'p-church': 'Church', 'p-book': 'Book club' },
    });
    const labels = [...container.querySelectorAll('[data-card-thread-label]')].map(
      (l) => l.textContent,
    );
    expect(labels).toEqual(['in Church', 'in Book club']);
    expect(
      container.querySelector('[data-card-thread="p-book"] [data-card-reply="x"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-card-thread="p-church"] [data-reaction-add]')).toBeNull();
    expect(container.querySelector('[data-card-thread=""] [data-reaction-add]')).not.toBeNull();
  });

  it('draws no labels where the card is not my own record’s', () => {
    expect(card().container.querySelector('[data-card-thread-label]')).toBeNull();
  });
});
