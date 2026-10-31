import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminFrame, Section, Table } from '@/features/admin/admin-frame';
import { LastWrite } from '@/features/admin/last-write';
import { LOCKED_ON_POOL_PAGES } from '@/features/admin/notes';
import { ActivityCharts } from '@/features/admin/activity-charts';
import { poolChart } from '@/lib/admin/daily';
import { requireAdmin } from '@/lib/admin/access';
import { memberRows, withOwnersJoined } from '@/lib/admin/metrics';
import * as read from '@/lib/admin/queries';
import { formatAt, formatDuration, formatRate, zoneOf } from '@/lib/admin/zones';
import { isUuid } from '@/lib/short-id';

/** /admin/pools/[id]: one pool's people, day by day, and each one's numbers (H71). */
export default async function AdminPool({ params, searchParams }: PageProps<'/admin/pools/[id]'>) {
  const { db, id: adminId } = await requireAdmin();
  const { id } = await params;
  const zone = zoneOf((await searchParams).tz);
  if (!isUuid(id)) notFound();
  const [now, start, pools, readPeople, events] = await Promise.all([
    read.readAt(),
    read.trackingStart(db),
    read.pools(db),
    read.people(db, id),
    read.events(db, id),
  ]);
  const pool = pools.find((p) => p.pool_id === id);
  if (!pool) notFound();
  const people = withOwnersJoined(readPeople, pools);
  const opens = people.length
    ? await read.opens(
        db,
        people.map((p) => p.user_id),
      )
    : [];
  // Members first, by join; then whoever opened a link and never joined.
  const ordered = [...people].sort(
    (a, b) =>
      (a.joined_at ? 0 : 1) - (b.joined_at ? 0 : 1) ||
      (a.joined_at ?? a.invited_at ?? '').localeCompare(b.joined_at ?? b.invited_at ?? ''),
  );
  const rows = memberRows(ordered, events, opens);
  // Counts only reach the browser: names, colours and per-day numbers.
  const chart = poolChart({
    people: ordered,
    events,
    opens,
    poolCreated: pool.created_at,
    trackingStart: start,
    now,
    zone,
    adminId,
  });

  return (
    <AdminFrame path={`/admin/pools/${id}`} zone={zone} trackingStart={start}>
      <h1 className="mb-4 text-lg font-semibold">{pool.name}</h1>
      <p className="text-pool-500 mb-1">
        Created {formatAt(pool.created_at, zone)} · {pool.pool_id}
      </p>
      <p className="text-pool-500 mb-6">{LOCKED_ON_POOL_PAGES}</p>

      <Section
        title="Activity"
        note="Each line is one member's actions in this pool per day: splashes, ripples, replies and reactions together. Days before someone joined are blank. App opens are not tied to a pool, so they sit in their own rows under the axis. Hover a day for the breakdown."
      >
        <ActivityCharts data={chart} />
      </Section>

      <Section
        title="Members"
        note="Counts are this pool's. Photo splash: one where its maker added a photo. Opens are across all pools; influenced: a direct open within 30 minutes of a push that was not tapped. Last write is tinted when it is more than 3 days old."
      >
        <Table
          groups={[
            { label: '', span: 2 },
            { label: 'Timing', span: 4 },
            { label: 'Writing', span: 5 },
            { label: 'Opens', span: 3 },
          ]}
          head={[
            'Member',
            'Status',
            'Joined',
            'Last seen',
            'Last write',
            'Join → first splash',
            'Splash',
            'Ripple',
            'Reply',
            'Reaction',
            'Photo / text',
            'Notification',
            'Direct',
            'Influenced',
          ]}
          // My own row, quietly, so it can be skipped.
          rowClass={(i) =>
            rows[i].person.user_id === adminId ? 'bg-pool-100 text-pool-500' : undefined
          }
          rows={rows.map((r) => {
            const splashes = r.photoSplashes + r.textSplashes;
            return [
              <span key="name">
                <Link className="underline" href={`/admin/users/${r.person.user_id}?tz=${zone}`}>
                  {r.person.display_name}
                </Link>
                {r.person.user_id === adminId ? ' (you)' : ''}
                {r.person.is_owner ? (
                  <span className="border-pool-200 text-pool-500 ml-1.5 rounded border px-1 text-[10px]">
                    owner
                  </span>
                ) : null}
              </span>,
              !r.person.joined_at ? 'opened invite' : r.person.left_at ? 'left' : 'member',
              formatAt(r.person.joined_at, zone),
              formatAt(r.lastSeen, zone),
              <LastWrite key="last-write" at={r.lastWrite} now={now} zone={zone} />,
              formatDuration(r.joinToFirstSplash),
              String(r.counts.splash),
              String(r.counts.ripple),
              String(r.counts.reply),
              String(r.counts.reaction),
              `${r.photoSplashes} / ${r.textSplashes} (${formatRate(splashes ? r.photoSplashes / splashes : null)} photo)`,
              String(r.opens.notification),
              String(r.opens.direct),
              String(r.opens.influenced),
            ];
          })}
        />
      </Section>
    </AdminFrame>
  );
}
