import Link from 'next/link';

import { AdminFrame, Section, Table } from '@/features/admin/admin-frame';
import { FUNNEL_HEAD, FunnelTable, funnelCells } from '@/features/admin/funnel-table';
import { requireAdmin } from '@/lib/admin/access';
import { activityOf, funnelOf, poolSummaries, withOwnersJoined } from '@/lib/admin/metrics';
import * as read from '@/lib/admin/queries';
import { formatAt, zoneOf } from '@/lib/admin/zones';

/** /admin: the funnel, overall and per pool, and which pools are still moving (H71). */
export default async function AdminOverview({ searchParams }: PageProps<'/admin'>) {
  const { db, id } = await requireAdmin();
  const zone = zoneOf((await searchParams).tz);
  const [now, start, pools, readPeople, events, opens, visits] = await Promise.all([
    read.readAt(),
    read.trackingStart(db),
    read.pools(db),
    read.people(db),
    read.events(db),
    read.opens(db),
    read.linkVisits(db),
  ]);
  const people = withOwnersJoined(readPeople, pools);
  const activity = activityOf(events, opens);
  const summaries = poolSummaries(pools, people, events, visits, id, now);
  const active = summaries.filter((s) => s.active);
  const inactive = summaries.filter((s) => !s.active);
  const poolLink = (poolId: string, name: string) => (
    <Link className="underline" href={`/admin/pools/${poolId}?tz=${zone}`}>
      {name}
    </Link>
  );

  return (
    <AdminFrame path="/admin" zone={zone} trackingStart={start}>
      <Section
        title="Funnel, all pools"
        note="Each membership counted once per pool. Owners are left out of Invited only, and count from Joined on, from their own join (or the pool's creation when they have none). Day N strict: any write in the pool or app open in the 24 hours starting N days after joining. Retained: any at all from day N on. Shown as yes/eligible: a member counts once the window can be answered. Opens only exist from the tracking start, so earlier returns rely on writes."
      >
        <FunnelTable funnel={funnelOf(people, events, activity, now)} />
      </Section>

      <Section
        title={`Pools: ${active.length} active, ${inactive.length} inactive`}
        note="Inactive: no splash, ripple, reply or reaction in the last 3 days."
      >
        <Table
          head={['Pool', 'Status', 'Last activity']}
          rows={summaries.map((s) => [
            poolLink(s.pool.pool_id, s.pool.name),
            s.active ? 'active' : 'inactive',
            formatAt(s.lastActivity, zone),
          ])}
        />
      </Section>

      <Section
        title="Funnel per pool"
        note="Link opens: visits to the pool's invite links, signed out included, one per browser per 30 minutes."
      >
        <Table
          head={['Pool', 'Link opens', ...FUNNEL_HEAD]}
          rows={summaries.map((s) => [
            poolLink(s.pool.pool_id, s.pool.name),
            String(s.linkVisits),
            ...funnelCells(
              funnelOf(
                people.filter((p) => p.pool_id === s.pool.pool_id),
                events.filter((e) => e.pool_id === s.pool.pool_id),
                activity,
                now,
              ),
            ),
          ])}
        />
      </Section>
    </AdminFrame>
  );
}
