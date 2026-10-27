'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useOptimistic, useState, useTransition } from 'react';

import { useToast } from '@/components/ui/toast';

export type ActionOutcome = { ok: true } | { ok: false; message: string };

/**
 * Every edit, add and delete is an optimistic update (CLAUDE.md, the
 * principle): the screen shows the result the moment the hand commits it,
 * the server action runs behind it, and the page re-reads inside the same
 * transition so the optimistic state holds until the real rows land. If
 * the action refuses, the optimistic state falls away with the transition
 * and the refusal is shown.
 *
 * `run(updater, work, saved?)`: `updater` is the change as the screen
 * should show it, `work` is the action that makes it true; `saved`, for a
 * change that saves with no Save button, is the toast once it has.
 */
export function useOptimisticAction<T>(value: T): {
  value: T;
  run: (updater: (current: T) => T, work: () => Promise<ActionOutcome>, saved?: string) => void;
  pending: boolean;
  message: string | null;
} {
  const router = useRouter();
  const [optimistic, apply] = useOptimistic<T, (current: T) => T>(value, (current, updater) =>
    updater(current),
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const toast = useToast();

  const run = useCallback(
    (updater: (current: T) => T, work: () => Promise<ActionOutcome>, saved?: string): void => {
      setMessage(null);
      startTransition(async () => {
        apply(updater);
        const outcome = await work();
        if (!outcome.ok) {
          setMessage(outcome.message);
          return;
        }
        if (saved) toast.show(saved);
        // Joins this transition, so the optimistic value holds until the
        // re-read lands rather than flashing back to the old rows.
        router.refresh();
      });
    },
    [apply, router, toast],
  );

  return { value: optimistic, run, pending, message };
}
