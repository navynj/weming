import Link from 'next/link';

import { AdminFrame, Section, Table } from '@/features/admin/admin-frame';
import { requireAdmin } from '@/lib/admin/access';
import { poolSummaries } from '@/lib/admin/metrics';
import * as read from '@/lib/admin/queries';
import { formatAt, zoneOf } from '@/lib/admin/zones';

/** /admin/pools: every pool, mine or not, by last activity (H71). */
export default async function AdminPools({ searchParams }: PageProps<'/admin/pools'>) {
  const { db, id } = await requireAdmin();
  const params = await searchParams;
  const zone = zoneOf(params.tz);
  const notIn = params.notin === '1';
  const [now, start, pools, people, events, visits] = await Promise.all([
    read.readAt(),
    read.trackingStart(db),
    read.pools(db),
    read.people(db),
    read.events(db),
    read.linkVisits(db),
  ]);
  const all = poolSummaries(pools, people, events, visits, id, now);
  const shown = notIn ? all.filter((s) => !s.adminIsMember) : all;

  return (
    <AdminFrame
      path="/admin/pools"
      zone={zone}
      trackingStart={start}
      query={notIn ? { notin: '1' } : {}}
    >
      <Section
        title={`Pools (${shown.length} of ${all.length})`}
        note="Sorted by last activity by others: anyone but you. Status is active when someone else wrote in the last 3 days."
      >
        <p className="mb-3 flex gap-4">
          <Link
            href={`/admin/pools?tz=${zone}`}
            className={notIn ? 'text-pool-500' : 'font-semibold underline'}
          >
            All pools
          </Link>
          <Link
            href={`/admin/pools?tz=${zone}&notin=1`}
            className={notIn ? 'font-semibold underline' : 'text-pool-500'}
          >
            Pools I&apos;m not in
          </Link>
        </p>
        <Table
          head={[
            'Pool',
            'Members',
            'Created',
            'Splashes',
            'Ripples',
            'Replies',
            'Reactions',
            'Status',
            'Last activity by others',
            'Last activity (all)',
            'I am a member',
          ]}
          rows={shown.map((s) => [
            <Link
              key={s.pool.pool_id}
              className="underline"
              href={`/admin/pools/${s.pool.pool_id}?tz=${zone}`}
            >
              {s.pool.name}
            </Link>,
            String(s.members),
            formatAt(s.pool.created_at, zone),
            String(s.counts.splash),
            String(s.counts.ripple),
            String(s.counts.reply),
            String(s.counts.reaction),
            s.active ? 'active' : 'inactive',
            formatAt(s.lastOthersActivity, zone),
            <span key="all" className="text-pool-500">
              {formatAt(s.lastActivity, zone)}
            </span>,
            s.adminIsMember ? 'yes' : 'no',
          ])}
        />
      </Section>
    </AdminFrame>
  );
}
