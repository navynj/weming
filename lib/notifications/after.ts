import { after } from 'next/server';

import { reportFailure } from '@/lib/report-failure';
import { createClient } from '@/lib/supabase/server';

import { dispatchPushes } from './dispatch';

/**
 * Called by every server action that can notify (H32): once it has
 * responded, push what this person's write left unsent. The database has
 * already written the notifications; this only delivers them, so a failure
 * here loses a buzz, never a row in the list.
 */
export function pushAfter(): void {
  after(async () => {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) await dispatchPushes(user.id);
    } catch (error) {
      reportFailure('push', error);
    }
  });
}
