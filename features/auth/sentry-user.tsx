'use client';

import { useEffect } from 'react';

import { tagSentryUser } from '@/lib/sentry-user';

/** The browser's errors carry my Supabase id (lib/sentry-user.ts), cleared when the shell goes. */
export function SentryUser({ id }: { id: string | null }) {
  useEffect(() => {
    tagSentryUser(id);
    return () => tagSentryUser(null);
  }, [id]);
  return null;
}
