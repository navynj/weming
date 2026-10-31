import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ActivityCharts } from '@/features/admin/activity-charts';
import { AdminFrame, Section, Table } from '@/features/admin/admin-frame';
import { LastWrite } from '@/features/admin/last-write';
import { LOCKED_ON_USER_PAGES, PUSH_NOTE } from '@/features/admin/notes';
import { requireAdmin } from '@/lib/admin/access';
import { userChart } from '@/lib/admin/daily';
import { notifyStatsBy, withOwnersJoined } from '@/lib/admin/metrics';
import * as read from '@/lib/admin/queries';
import {
  permissionLabel,
  recordSplit,
  signupRetention,
  userPoolRows,
  userTiming,
  type Returned,
} from '@/lib/admin/users';
import { formatAt, formatDuration, formatRate, zoneOf } from '@/lib/admin/zones';
import { isUuid } from '@/lib/short-id';

function answer(back: boolean | null): string {
  return back === null ? 'not yet' : back ? 'yes' : 'no';
}

const returnedCells = (r: Returned): string[] => [answer(r.strict), answer(r.retained)];

/** /admin/users/[id]: one person, from sign-up through today, by place (H71). */
export default async function AdminUser({ params, searchParams }: PageProps<'/admin/users/[id]'>) {
  const { db } = await requireAdmin();
  const { id } = await params;
  const zone = zoneOf((await searchParams).tz);
  if (!isUuid(id)) notFound();
  const [now, start, users, events, records, people, pools, opens, sent, push, permissions] =
    await Promise.all([
      read.readAt(),
      read.trackingStart(db),
      read.users(db),
      read.userEvents(db, id),
      read.userRecords(db, id),
      read.people(db),
      read.pools(db),
      read.opens(db, [id]),
      read.notifications(db),
      read.pushStatus(db),
      read.permissions(db),
    ]);
  const user = users.find((u) => u.user_id === id);
  if (!user) notFound();

  const poolNames = new Map(pools.map((p) => [p.pool_id, p.name]));
  const memberships = withOwnersJoined(
    people.filter((p) => p.user_id === id),
    pools,
  );
  const timing = userTiming({ user, records, memberships, events, opens });
  const back = signupRetention(user.signed_up_at, events, opens, now);
  const split = recordSplit(records);
  const poolRows = userPoolRows(memberships, poolNames, events);
  const chart = userChart({
    name: user.display_name,
    signedUp: user.signed_up_at,
    events,
    opens,
    pools: poolRows.map((p) => ({ poolId: p.poolId, name: p.name, joinedAt: p.joinedAt })),
    trackingStart: start,
    now,
    zone,
  });
  const mine = sent.filter((n) => n.user_id === id);
  const subscriptions = push.find((p) => p.user_id === id)?.subscriptions ?? 0;
  const permission = permissions.find((p) => p.user_id === id)?.permission ?? null;

  return (
    <AdminFrame path={`/admin/users/${id}`} zone={zone} trackingStart={start}>
      <h1 className="mb-1 text-lg font-semibold">{user.display_name}</h1>
      <p className="text-pool-500 mb-1">
        {user.user_id} · push: {subscriptions > 0 ? 'subscribed' : 'no subscription'},{' '}
        {permissionLabel(permission)}
      </p>
      <p className="text-pool-500 mb-1">{LOCKED_ON_USER_PAGES}</p>
      <p className="text-pool-500 mb-6">{PUSH_NOTE}</p>

      <Section title="Timing">
        <Table
          head={[
            'Signed up',
            'First record',
            'First pool join',
            'Sign-up → first record',
            'Last seen',
            'Last write',
          ]}
          rows={[
            [
              formatAt(timing.signedUp, zone),
              formatAt(timing.firstRecord, zone),
              formatAt(timing.firstPoolJoin, zone),
              formatDuration(timing.signupToFirstRecord),
              formatAt(timing.lastSeen, zone),
              <LastWrite key="last-write" at={timing.lastWrite} now={now} zone={zone} />,
            ],
          ]}
        />
      </Section>

      <Section
        title="Back after sign-up"
        note="Counted from sign-up, not per pool. Strict: any write anywhere or app open in the 24 hours starting N days after sign-up. Retained: any at all from day N on. Opens exist only from the tracking start."
      >
        <Table
          groups={[
            { label: 'Day 3', span: 2 },
            { label: 'Day 7', span: 2 },
          ]}
          head={['Strict', 'Retained', 'Strict', 'Retained']}
          rows={[[...returnedCells(back.day3), ...returnedCells(back.day7)]]}
        />
      </Section>

      <Section
        title="Records"
        note="Records this person made, without the welcome splash. Home only: never shared to a pool."
      >
        <Table
          head={['Total', 'Home only', 'Shared to 1 pool', 'Shared to 2+ pools']}
          rows={[
            [
              String(split.total),
              `${split.home} (${formatRate(split.total ? split.home / split.total : null)})`,
              String(split.onePool),
              String(split.manyPools),
            ],
          ]}
        />
      </Section>

      <Section
        title="Activity"
        note="One line per place: Home, then each pool from the day they joined it. A record shown in several places counts once in each; the faint dashed line counts each thing written once, so a record written on Home and shared into a pool later shows in that pool's count on the day it was shared (the hover says so: “+1 shared from Home”) and in the unique line on the day it was written. App opens sit in their own row under the axis. Hover a day for the breakdown."
      >
        <ActivityCharts data={chart} />
      </Section>

      <Section title="Pools">
        <Table
          groups={[
            { label: '', span: 4 },
            { label: 'Writing', span: 4 },
          ]}
          head={['Pool', 'Status', 'Joined', 'Last write', 'Splash', 'Ripple', 'Reply', 'Reaction']}
          rows={poolRows.map((p) => [
            <Link key="pool" className="underline" href={`/admin/pools/${p.poolId}?tz=${zone}`}>
              {p.name}
            </Link>,
            p.leftAt ? 'left' : 'member',
            formatAt(p.joinedAt, zone),
            <LastWrite key="last-write" at={p.lastWrite} now={now} zone={zone} />,
            String(p.counts.splash),
            String(p.counts.ripple),
            String(p.counts.reply),
            String(p.counts.reaction),
          ])}
        />
      </Section>

      <Section
        title="Notifications"
        note="Pushes to this person, by pool. Sent: a push service accepted it. Influenced: not tapped, and a direct open followed within 30 minutes."
      >
        <Table
          head={['Pool', 'Sent', 'Tapped', 'Tap rate', 'Influenced', 'Median send → open']}
          rows={notifyStatsBy(mine, (n) => n.pool_id).map((g) => [
            poolNames.get(g.key) ?? g.key,
            String(g.stats.sent),
            String(g.stats.tapped),
            formatRate(g.stats.tapRate),
            String(g.stats.influenced),
            formatDuration(g.stats.medianToOpen),
          ])}
        />
      </Section>
    </AdminFrame>
  );
}
