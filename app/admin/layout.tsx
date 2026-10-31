import { requireAdmin } from '@/lib/admin/access';

/**
 * /admin (H71). No metadata of its own: a title here would reach the 404
 * a non-admin gets, and say the route exists. The check here only keeps
 * the frame from rendering for anyone else; each page asks again, because
 * a layout's check does not hold the pages under it.
 */
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await requireAdmin();
  return children;
}
