import type { Funnel } from '@/lib/admin/metrics';
import { formatRatio } from '@/lib/admin/zones';

import { Table } from './admin-frame';

export const FUNNEL_HEAD = [
  'Invited',
  'Joined',
  'First splash',
  'Day 3 strict',
  'Day 3 retained',
  'Day 7 strict',
  'Day 7 retained',
];

export function funnelCells(f: Funnel): string[] {
  return [
    String(f.invited),
    String(f.joined),
    String(f.firstSplash),
    formatRatio(f.day3.strict),
    formatRatio(f.day3.retained),
    formatRatio(f.day7.strict),
    formatRatio(f.day7.retained),
  ];
}

/** One funnel per row, each named: everyone, and without the admin's own memberships. */
export function FunnelTable({ rows }: { rows: { label: string; funnel: Funnel }[] }) {
  return (
    <Table
      head={['', ...FUNNEL_HEAD]}
      rows={rows.map((r) => [r.label, ...funnelCells(r.funnel)])}
    />
  );
}
