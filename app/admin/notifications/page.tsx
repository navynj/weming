import { AdminFrame, Section, Table } from '@/features/admin/admin-frame';
import { requireAdmin } from '@/lib/admin/access';
import { notifyStats, notifyStatsBy, type NotifyStats } from '@/lib/admin/metrics';
import * as read from '@/lib/admin/queries';
import { formatDuration, formatRate, zoneOf } from '@/lib/admin/zones';

const HEAD = ['Sent', 'Tapped', 'Tap rate', 'Influenced', 'Influenced rate', 'Median send → open'];

function cells(s: NotifyStats): string[] {
  return [
    String(s.sent),
    String(s.tapped),
    formatRate(s.tapRate),
    String(s.influenced),
    formatRate(s.influencedRate),
    formatDuration(s.medianToOpen),
  ];
}

/** /admin/notifications: pushes sent, tapped, and what followed, per pool and person (H71). */
export default async function AdminNotifications({
  searchParams,
}: PageProps<'/admin/notifications'>) {
  const { db } = await requireAdmin();
  const zone = zoneOf((await searchParams).tz);
  const [start, pools, people, sent] = await Promise.all([
    read.trackingStart(db),
    read.pools(db),
    read.people(db),
    read.notifications(db),
  ]);
  const poolName = new Map(pools.map((p) => [p.pool_id, p.name]));
  const personName = new Map(people.map((p) => [p.user_id, p.display_name]));

  return (
    <AdminFrame path="/admin/notifications" zone={zone} trackingStart={start}>
      <Section
        title="All pushes"
        note="Sent: a push service accepted it for at least one of the person's browsers. Tapped: the app was opened from it. Influenced: not tapped, and the person opened the app directly within 30 minutes. Both rates are of those sent. Median send → open counts tapped and influenced pushes."
      >
        <Table head={HEAD} rows={[cells(notifyStats(sent))]} />
      </Section>
      <Section title="Per pool">
        <Table
          head={['Pool', ...HEAD]}
          rows={notifyStatsBy(sent, (n) => n.pool_id).map((g) => [
            poolName.get(g.key) ?? g.key,
            ...cells(g.stats),
          ])}
        />
      </Section>
      <Section title="Per person">
        <Table
          head={['Person', ...HEAD]}
          rows={notifyStatsBy(sent, (n) => n.user_id).map((g) => [
            personName.get(g.key) ?? g.key,
            ...cells(g.stats),
          ])}
        />
      </Section>
      <Section title="Per kind">
        <Table
          head={['Kind', ...HEAD]}
          rows={notifyStatsBy(sent, (n) => n.type).map((g) => [g.key, ...cells(g.stats)])}
        />
      </Section>
    </AdminFrame>
  );
}
