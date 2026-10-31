import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PoolActivityCharts, type PoolActivityData } from '@/features/admin/pool-activity-charts';

/** The pool page's charts (H71): a day's column shows who did what, in one fixed order. */
const data: PoolActivityData = {
  days: ['2026-10-26', '2026-10-27', '2026-10-28'],
  trackingStartIndex: 1,
  members: [
    {
      name: 'Me',
      color: '#B8BECC',
      isAdmin: true,
      joinedIndex: 0,
      counts: [
        [0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ],
    },
    {
      name: 'Ana',
      color: '#4E79A7',
      isAdmin: false,
      joinedIndex: 1,
      counts: [
        [0, 0, 0, 0, 0],
        [0, 0, 2, 1, 3],
        [0, 0, 0, 0, 0],
      ],
    },
  ],
};

function hoverDay(container: HTMLElement, index: number, chart = 0): void {
  const svg = container.querySelectorAll('svg[role="img"]')[chart];
  const columns = [...svg.querySelectorAll('rect[fill="transparent"]')];
  fireEvent.pointerEnter(columns[index], { clientX: 100, clientY: 100 });
}

afterEach(cleanup);

describe('the activity charts', () => {
  it('labels every day through today', () => {
    const { container } = render(<PoolActivityCharts data={data} />);
    const labels = [
      ...container.querySelectorAll('svg[role="img"]')[0].querySelectorAll('text'),
    ].map((t) => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['10-26', '10-27', '10-28']));
  });

  it('lists every joined member with every kind in order, zeros included', () => {
    const { container } = render(<PoolActivityCharts data={data} />);
    hoverDay(container, 1);
    const table = screen.getByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Member', 'Splash', 'Ripple', 'Reply', 'Reaction', 'Opens']);
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
    expect(rows).toEqual(['Me10000', 'Ana00213']);
  });

  it('leaves out a member before they joined, says no activity, and marks unrecorded opens', () => {
    const { container } = render(<PoolActivityCharts data={data} />);
    hoverDay(container, 0);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(['Me · no activity0000—']);
    expect(screen.getByText('Opens are not recorded for this day.')).toBeTruthy();
  });

  it('answers a hover on the small multiples the same way', () => {
    const { container } = render(<PoolActivityCharts data={data} />);
    hoverDay(container, 2, 1);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
  });
});
