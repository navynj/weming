import { createClient as createServiceClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

import type { Database } from '@/lib/database.types';
import { supabaseServiceRoleKey, supabaseUrl } from '@/lib/env';
import { sweepMedia, sweepSummary } from '@/lib/media-sweep';
import { storage } from '@/lib/storage';

/**
 * The daily media sweep (H70), called by Vercel Cron (vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`. Without the secret configured it
 * answers nobody. `?dry` counts what it would remove and removes nothing.
 * The log and the answer carry counts and bytes only, never a path.
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorized(request.headers.get('authorization'))) {
    return new Response('Unauthorized', { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.has('dry');
  try {
    const report = await sweepMedia({
      storage: storage(),
      db: createServiceClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
        auth: { persistSession: false },
      }),
      dryRun,
    });
    console.log(`[during] media sweep: ${sweepSummary(report)}`);
    return Response.json(report);
  } catch (error) {
    // A read that failed removes nothing; the next day's run tries again.
    console.error(
      `[during] media sweep failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return Response.json({ ok: false }, { status: 500 });
  }
}

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
