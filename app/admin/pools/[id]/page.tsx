import { notFound } from 'next/navigation';

import { ActivityTimeline } from '@/features/admin/activity-timeline';
import { AdminFrame, Section, Table } from '@/features/admin/admin-frame';
import { requireAdmin } from '@/lib/admin/access';
import { memberRows } from '@/lib/admin/metrics';
import * as read from '@/lib/admin/queries';
import { formatAt, formatDuration, formatRate, zoneOf } from '@/lib/admin/zones';
import { isUuid } from '@/lib/short-id';

/** /admin/pools/[id]: one pool's people, day by day, and each one's numbers (H71). */
export default async function AdminPool({ params, searchParams }: PageProps<'/admin/pools/[id]'>) {
  const { db } = await requireAdmin();
  const { id } = await params;
  const zone = zoneOf((await searchParams).tz);
  if (!isUuid(id)) notFound();
  const [now, start, pools, people, events] = await Promise.all([
    read.readAt(),
    read.trackingStart(db),
    read.pools(db),
    read.people(db, id),
    read.events(db, id),
  ]);
  const pool = pools.find((p) => p.pool_id === id);
  if (!pool) notFound();
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

  return (
    <AdminFrame path={`/admin/pools/${id}`} zone={zone} trackingStart={start}>
      <h1 className="mb-4 text-lg font-semibold">{pool.name}</h1>
      <p className="text-pool-500 mb-6">
        Created {formatAt(pool.created_at, zone)} · {pool.pool_id}
      </p>

      <Section
        title="Activity"
        note="One band per person; a dot per day and kind. App opens are not tied to a pool, so they show every open."
      >
        <ActivityTimeline
          people={ordered}
          events={events}
          opens={opens}
          poolCreated={pool.created_at}
          now={now}
          zone={zone}
        />
      </Section>

      <Section
        title="Members"
        note="Counts are this pool's. Photo splash: one where its maker added a photo. Opens are across all pools; influenced: a direct open within 30 minutes of a push that was not tapped."
      >
        <Table
          head={[
            'Member',
            'Status',
            'Joined',
            'Last seen',
            'Last write',
            'Join → first splash',
            'Splashes',
            'Ripples',
            'Replies',
            'Reactions',
            'Photo / text splashes',
            'Opens: notification',
            'Direct',
            'Influenced',
          ]}
          rows={rows.map((r) => {
            const splashes = r.photoSplashes + r.textSplashes;
            return [
              r.person.display_name,
              r.person.is_owner
                ? 'owner'
                : !r.person.joined_at
                  ? 'opened invite'
                  : r.person.left_at
                    ? 'left'
                    : 'member',
              formatAt(r.person.joined_at, zone),
              formatAt(r.lastSeen, zone),
              formatAt(r.lastWrite, zone),
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
