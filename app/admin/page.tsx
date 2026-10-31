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
  const params = await searchParams;
  const zone = zoneOf(params.tz);
  // The per-pool funnel without my own memberships: I am in every pool.
  const withoutMe = params.me === 'out';
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
  const others = people.filter((p) => p.user_id !== id);
  const perPool = withoutMe ? others : people;
  const poolLink = (poolId: string, name: string) => (
    <Link className="underline" href={`/admin/pools/${poolId}?tz=${zone}`}>
      {name}
    </Link>
  );

  return (
    <AdminFrame
      path="/admin"
      zone={zone}
      trackingStart={start}
      query={withoutMe ? { me: 'out' } : {}}
    >
      <Section
        title="Funnel, all pools"
        note="Each membership counted once per pool. Owners are left out of Invited only, and count from Joined on, from their own join (or the pool's creation when they have none). Day N strict: any write in the pool or app open in the 24 hours starting N days after joining. Retained: any at all from day N on. Shown as yes/eligible: a member counts once the window can be answered. Opens only exist from the tracking start, so earlier returns rely on writes."
      >
        <FunnelTable
          rows={[
            { label: 'Everyone', funnel: funnelOf(people, events, activity, now) },
            // I am in every pool: my memberships inflate Joined and First splash.
            { label: 'Without me', funnel: funnelOf(others, events, activity, now) },
          ]}
        />
      </Section>

      <Section
        title={`Pools: ${active.length} active, ${inactive.length} inactive`}
        note="Inactive: no splash, ripple, reply or reaction by anyone but you in the last 3 days. Your own writes do not count: you post to every pool."
      >
        <Table
          head={['Pool', 'Status', 'Last activity by others', 'Last activity (all)']}
          rows={summaries.map((s) => [
            poolLink(s.pool.pool_id, s.pool.name),
            s.active ? 'active' : 'inactive',
            formatAt(s.lastOthersActivity, zone),
            <span key="all" className="text-pool-500">
              {formatAt(s.lastActivity, zone)}
            </span>,
          ])}
        />
      </Section>

      <Section
        title="Funnel per pool"
        note="Link opens: visits to the pool's invite links, signed out included, one per browser per 30 minutes."
      >
        <p className="mb-2 flex gap-4">
          <Link
            href={`/admin?tz=${zone}`}
            className={withoutMe ? 'text-pool-500' : 'font-semibold underline'}
          >
            Everyone
          </Link>
          <Link
            href={`/admin?tz=${zone}&me=out`}
            className={withoutMe ? 'font-semibold underline' : 'text-pool-500'}
          >
            Without me
          </Link>
        </p>
        <Table
          head={['Pool', 'Link opens', ...FUNNEL_HEAD]}
          rows={summaries.map((s) => [
            poolLink(s.pool.pool_id, s.pool.name),
            String(s.linkVisits),
            ...funnelCells(
              funnelOf(
                perPool.filter((p) => p.pool_id === s.pool.pool_id),
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
