import Link from 'next/link';

import { AdminFrame, Section, Table } from '@/features/admin/admin-frame';
import { LastWrite } from '@/features/admin/last-write';
import { LOCKED_ON_USER_PAGES, PUSH_NOTE } from '@/features/admin/notes';
import { requireAdmin } from '@/lib/admin/access';
import * as read from '@/lib/admin/queries';
import { permissionLabel, userListRows } from '@/lib/admin/users';
import { formatAt, formatRate, zoneOf } from '@/lib/admin/zones';

/** /admin/users: everyone, quietest first (H71). */
export default async function AdminUsers({ searchParams }: PageProps<'/admin/users'>) {
  const { db, id: adminId } = await requireAdmin();
  const params = await searchParams;
  const zone = zoneOf(params.tz);
  // Without me by default: I am in every pool and write in all of them.
  const withMe = params.me === 'in';
  const [now, start, users, events, records, people, opens, push, permissions] = await Promise.all([
    read.readAt(),
    read.trackingStart(db),
    read.users(db),
    read.userEvents(db),
    read.userRecords(db),
    read.people(db),
    read.opens(db),
    read.pushStatus(db),
    read.permissions(db),
  ]);
  const rows = userListRows({ users, events, records, people, opens, push, permissions }).filter(
    (r) => withMe || r.user.user_id !== adminId,
  );

  return (
    <AdminFrame
      path="/admin/users"
      zone={zone}
      trackingStart={start}
      query={withMe ? { me: 'in' } : {}}
    >
      <Section
        title={`Users (${rows.length})`}
        note="Sorted by last write, oldest first: people going quiet are at the top, and anyone who has not written yet above them. Records leave out the welcome splash every new account starts with."
      >
        <p className="text-pool-500 mb-1">{LOCKED_ON_USER_PAGES}</p>
        <p className="text-pool-500 mb-3">{PUSH_NOTE}</p>
        <p className="mb-3 flex gap-4">
          <Link
            href={`/admin/users?tz=${zone}`}
            className={withMe ? 'text-pool-500' : 'font-semibold underline'}
          >
            Without me
          </Link>
          <Link
            href={`/admin/users?tz=${zone}&me=in`}
            className={withMe ? 'font-semibold underline' : 'text-pool-500'}
          >
            Include me
          </Link>
        </p>
        <Table
          groups={[
            { label: '', span: 1 },
            { label: 'Timing', span: 3 },
            { label: 'Pools', span: 1 },
            { label: 'Records', span: 4 },
            { label: 'Push', span: 2 },
          ]}
          head={[
            'User',
            'Signed up',
            'Last seen',
            'Last write',
            'In pools',
            'Total',
            'Home only',
            'Shared to 1 pool',
            'Shared to 2+',
            'Subscription',
            'Permission',
          ]}
          rowClass={(i) =>
            rows[i].user.user_id === adminId ? 'bg-pool-100 text-pool-500' : undefined
          }
          rows={rows.map((r) => [
            <Link
              key="name"
              className="underline"
              href={`/admin/users/${r.user.user_id}?tz=${zone}`}
            >
              {r.user.display_name}
              {r.user.user_id === adminId ? ' (you)' : ''}
            </Link>,
            formatAt(r.user.signed_up_at, zone),
            formatAt(r.lastSeen, zone),
            <LastWrite key="last-write" at={r.lastWrite} now={now} zone={zone} />,
            String(r.pools),
            String(r.records.total),
            `${r.records.home} (${formatRate(r.records.total ? r.records.home / r.records.total : null)})`,
            String(r.records.onePool),
            String(r.records.manyPools),
            r.push.subscriptions > 0
              ? `subscribed${r.push.subscriptions > 1 ? ` (${r.push.subscriptions} browsers)` : ''}`
              : 'no subscription',
            permissionLabel(r.push.permission),
          ])}
        />
      </Section>
    </AdminFrame>
  );
}
