import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The sweep's route (H70): Vercel Cron's secret or nothing, `?dry` removes
 * nothing, and the session check never stands in its way.
 */
const sweep = vi.hoisted(() => vi.fn());
vi.mock('@/lib/media-sweep', () => ({
  sweepMedia: sweep,
  sweepSummary: () => 'counts',
}));
vi.mock('@/lib/storage', () => ({ storage: () => ({ name: 'supabase' }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

import { GET } from '@/app/api/cron/sweep-media/route';
import { config } from '@/proxy';

const call = (auth: string | null, query = '') =>
  GET(
    new Request(`http://x/api/cron/sweep-media${query}`, {
      headers: auth ? { authorization: auth } : {},
    }),
  );

let secret: string | undefined;
beforeEach(() => {
  secret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 's3cret';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
  sweep.mockReset();
  sweep.mockResolvedValue({ dryRun: false, buckets: {} });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  process.env.CRON_SECRET = secret;
  vi.restoreAllMocks();
});

describe('the sweep route', () => {
  it('answers only with the secret', async () => {
    expect((await call(null)).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
    expect((await call('Bearer s3cret')).status).toBe(200);
    expect(sweep).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
  });

  it('answers nobody when no secret is configured', async () => {
    delete process.env.CRON_SECRET;
    expect((await call('Bearer ')).status).toBe(401);
    expect((await call('Bearer undefined')).status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });

  it('removes nothing with ?dry', async () => {
    await call('Bearer s3cret', '?dry');
    expect(sweep).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  });

  it('is not behind the session check, which would send the cron to sign-in', () => {
    const guarded = (path: string) =>
      config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path));
    expect(guarded('/api/cron/sweep-media')).toBe(false);
    expect(guarded('/')).toBe(true);
    expect(guarded('/api/other')).toBe(true);
  });
});
