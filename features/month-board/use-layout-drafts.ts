'use client';

import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useToast } from '@/components/ui/toast';
import type { Card } from '@/features/home/grid';

import { revertToPoolLayout, setBoardLayout } from './actions';
import { clearLayout, mergeLayout, type BoardLayoutJson, type LayoutSource } from './board-layout';

/** How long the sliders must rest before a layout is saved (review). */
export const LAYOUT_SAVE_MS = 400;

/** A splash's unsaved layout: what the board draws, and what the next save sends. */
type Draft = {
  layout: BoardLayoutJson;
  patch: BoardLayoutJson;
  clear: string[];
  /** Bumped on every edit; `sent` is the version last handed to a save. */
  version: number;
  sent: number;
};

/** What a layout looks like on screen: its fields, and whose they are. */
export type Shown = { layout: BoardLayoutJson; source: LayoutSource };

/** The dotted paths a patch sets, so a pending clear of one is forgotten when it is set again. */
function setPaths(patch: BoardLayoutJson): Set<string> {
  const out = new Set<string>();
  for (const group of ['icon', 'label', 'wave'] as const) {
    for (const field of Object.keys(patch[group] ?? {})) out.add(`${group}.${field}`).add(group);
  }
  for (const [path, value] of Object.entries(patch.photos ?? {})) {
    out.add(`photos.${path}`);
    for (const field of Object.keys(value)) out.add(`photos.${path}.${field}`);
  }
  return out;
}

/**
 * The Layout panel's unsaved values (review). An edit is drawn on the board
 * at once; once the sliders have rested 400ms, every splash's pending edit
 * is saved through set_board_layout — the patches and clears gathered since
 * the last save, as one — inside a transition, so the saved value holds
 * until the re-read lands (CLAUDE.md, the principle). A draft is dropped
 * once its save is confirmed or refused; a refusal falls back to what was
 * saved, and says why. An edit made while a save is out is kept, and sent
 * after it. Writes go to the pool's layout in a pool, to my Home layout on
 * Home.
 */
export function useLayoutDrafts(cards: Card[], poolId: string | null) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  const toast = useToast();
  const [held, hold] = useOptimistic<Record<string, Shown>, { id: string; shown: Shown }>(
    {},
    (current, { id, shown }) => ({ ...current, [id]: shown }),
  );
  const byId = useMemo(() => new Map(cards.map((c) => [c.splash.id, c])), [cards]);
  const source: LayoutSource = poolId ? 'pool' : 'home';

  /** What the board draws for a splash: its draft, else a save in flight, else what was saved. */
  const shown = useCallback(
    (id: string): Shown => {
      const draft = drafts[id];
      if (draft) return { layout: draft.layout, source };
      if (held[id]) return held[id];
      const card = byId.get(id);
      return { layout: card?.layout ?? {}, source: card?.layoutSource ?? null };
    },
    [drafts, held, byId, source],
  );

  /** A change: drawn now, saved once the sliders rest. On Home my first change makes a Home layout of my own. */
  const edit = useCallback(
    (id: string, patch: BoardLayoutJson, clear: string[] = []): void => {
      setMessage(null);
      setDrafts((all) => {
        const was = all[id];
        const base = was?.layout ?? shown(id).layout;
        const set = setPaths(patch);
        return {
          ...all,
          [id]: {
            layout: clearLayout(mergeLayout(base, patch), clear),
            patch: clearLayout(mergeLayout(was?.patch ?? {}, patch), clear),
            clear: [...(was?.clear ?? []).filter((path) => !set.has(path)), ...clear],
            version: (was?.version ?? 0) + 1,
            sent: was?.sent ?? 0,
          },
        };
      });
    },
    [shown],
  );

  // The rest: every edit restarts the wait; when it runs out, each draft not
  // yet sent at its latest version is saved.
  useEffect(() => {
    const due = Object.entries(drafts).filter(([, d]) => d.version !== d.sent);
    if (due.length === 0) return;
    const timer = window.setTimeout(() => {
      for (const [id, draft] of due) {
        setDrafts((all) => (all[id] ? { ...all, [id]: { ...all[id], sent: draft.version } } : all));
        startTransition(async () => {
          hold({ id, shown: { layout: draft.layout, source } });
          const result = await setBoardLayout({
            splashId: id,
            poolId,
            patch: draft.patch,
            clear: draft.clear,
          });
          if (result.ok) {
            // Saved with no Save button: said once it has (Yoonji, in the session).
            toast.show('Layout saved');
            router.refresh();
          } else setMessage(result.message);
          // Dropped once answered — unless the hand moved again meanwhile.
          setDrafts((all) => {
            if (all[id]?.version !== draft.version) return all;
            const next = { ...all };
            delete next[id];
            return next;
          });
        });
      }
    }, LAYOUT_SAVE_MS);
    return () => window.clearTimeout(timer);
  }, [drafts, hold, poolId, router, source, toast]);

  /** "Use pool layout": my Home layout gone; the pool's is drawn again at once. */
  const revertToPool = useCallback(
    (id: string): void => {
      const card = byId.get(id);
      setMessage(null);
      setDrafts((all) => {
        const next = { ...all };
        delete next[id];
        return next;
      });
      startTransition(async () => {
        hold({
          id,
          shown: { layout: card?.poolLayout ?? {}, source: card?.poolLayout ? 'pool' : null },
        });
        const result = await revertToPoolLayout(id);
        if (result.ok) router.refresh();
        else setMessage(result.message);
      });
    },
    [byId, hold, router],
  );

  /** The cards as the board draws them. */
  const drawn = useMemo(
    () =>
      cards.map((card) => {
        const id = card.splash.id;
        if (!drafts[id] && !held[id]) return card;
        const s = shown(id);
        return { ...card, layout: s.layout, layoutSource: s.source };
      }),
    [cards, drafts, held, shown],
  );

  return { drawn, shown, edit, revertToPool, message, saving, unsaved: Object.keys(drafts) };
}
