import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ActivityCharts, type ActivityData } from '@/features/admin/activity-charts';

/** The dashboard's charts (H71): a day's column shows who did what, in one fixed order. */
const counts = (...days: number[][]) => days as [number, number, number, number, number][];
const data: ActivityData = {
  days: ['2026-10-26', '2026-10-27', '2026-10-28'],
  trackingStartIndex: 1,
  axisLabel: 'Actions in this pool',
  rowLabel: 'Member',
  barsLabel: 'Per member',
  series: [
    {
      name: 'Me',
      color: '#B8BECC',
      style: 'mine',
      startIndex: 0,
      counts: counts([0, 0, 0, 0, 0], [1, 0, 0, 0, 0], [0, 0, 0, 0, 0]),
      hasOpens: true,
      bars: true,
    },
    {
      name: 'Ana',
      color: '#4E79A7',
      style: 'solid',
      startIndex: 1,
      counts: counts([0, 0, 0, 0, 0], [0, 0, 2, 1, 3], [0, 0, 0, 0, 0]),
      hasOpens: true,
      bars: true,
    },
  ],
  opensRows: [],
};

function hoverDay(container: HTMLElement, index: number, chart = 0): void {
  const svg = container.querySelectorAll('svg[role="img"]')[chart];
  const columns = [...svg.querySelectorAll('rect[fill="transparent"]')];
  fireEvent.pointerEnter(columns[index], { clientX: 100, clientY: 100 });
}

afterEach(cleanup);

describe('the activity charts', () => {
  it('labels every day through today', () => {
    const { container } = render(<ActivityCharts data={data} />);
    const labels = [
      ...container.querySelectorAll('svg[role="img"]')[0].querySelectorAll('text'),
    ].map((t) => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['10-26', '10-27', '10-28']));
  });

  it('draws my line last, thin and dashed, so it never hides or vanishes under another', () => {
    const { container } = render(<ActivityCharts data={data} />);
    const lines = [...container.querySelectorAll('svg[role="img"]')[0].querySelectorAll('path')];
    expect(lines.map((p) => p.getAttribute('stroke'))).toEqual(['#4E79A7', '#B8BECC']);
    expect(lines[1].getAttribute('stroke-dasharray')).toBe('4 3');
    expect(lines[1].getAttribute('stroke-width')).toBe('1');
    expect(lines[0].getAttribute('stroke-dasharray')).toBeNull();
  });

  it('lists every joined member with every kind in order, zeros included', () => {
    const { container } = render(<ActivityCharts data={data} />);
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
    const { container } = render(<ActivityCharts data={data} />);
    hoverDay(container, 0);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(['Me · no activity0000—']);
    expect(screen.getByText('Opens are not recorded for this day.')).toBeTruthy();
  });

  it('answers a hover on the small multiples the same way', () => {
    const { container } = render(<ActivityCharts data={data} />);
    hoverDay(container, 2, 1);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
  });

  it("on a person's page, a place has no opens and the unique row carries them", () => {
    const user: ActivityData = {
      days: ['2026-10-27', '2026-10-28'],
      trackingStartIndex: 0,
      axisLabel: 'Actions by place',
      rowLabel: 'Place',
      series: [
        {
          name: 'Home',
          color: '#161621',
          style: 'solid',
          startIndex: 0,
          counts: counts([1, 1, 0, 0, 0], [0, 0, 0, 0, 0]),
          hasOpens: false,
          bars: false,
        },
        {
          name: 'Crew',
          color: '#4E79A7',
          style: 'solid',
          startIndex: 0,
          counts: counts([1, 0, 0, 0, 0], [0, 0, 0, 0, 0]),
          hasOpens: false,
          bars: false,
        },
        {
          name: 'Unique (Ana)',
          color: '#6B79A3',
          style: 'unique',
          startIndex: 0,
          counts: counts([1, 1, 0, 0, 2], [0, 0, 0, 0, 0]),
          hasOpens: true,
          bars: false,
        },
      ],
      opensRows: [{ name: 'Ana', color: '#161621', startIndex: 0, counts: [2, 0] }],
    };
    const { container } = render(<ActivityCharts data={user} />);
    // No small multiples on a person's page: one chart.
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(1);
    hoverDay(container, 0);
    const rows = within(screen.getByRole('table'))
      .getAllByRole('row')
      .map((r) => r.textContent);
    expect(rows).toEqual([
      'PlaceSplashRippleReplyReactionOpens',
      'Home1100—',
      'Crew1000—',
      'Unique (Ana)11002',
    ]);
  });
});
