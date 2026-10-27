'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';

import { useToast } from '@/components/ui/toast';
import type { Card } from '@/features/home/grid';
import type { BoardView } from '@/lib/queries/layouts';

import { revertToPoolLayout, setBoardLayout } from './actions';
import { clearLayout, mergeLayout, type BoardLayoutJson, type LayoutSource } from './board-layout';
import { pathsOf } from './handle-math';

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
  /** The layout when this run of edits began: what undo puts back. */
  base: BoardLayoutJson;
  /** A handle is still down: drawn, never saved until it is let go. */
  held: boolean;
  /** Let go, or an undo: saved at once, not after the rest. */
  now: boolean;
  /** An undo's own write: never itself a change to undo. */
  untracked: boolean;
};

/** What a layout looks like on screen: its fields, and whose they are. */
export type Shown = { layout: BoardLayoutJson; source: LayoutSource };

/** How an edit is made: by a slider or key (saved after the rest), a handle held, or at once. */
export type EditHow = { hold?: boolean; now?: boolean; untracked?: boolean };

/** A save the database took: the paths it changed and what they held before, for undo. */
export type SavedChange = { id: string; before: BoardLayoutJson; paths: string[] };

/** A splash's save, as the toolbar says it: on its way, or done. */
export type SaveStatus = 'saving' | 'saved' | null;

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
export function useLayoutDrafts(
  cards: Card[],
  poolId: string | null,
  /** Which view's layouts these are (0045): the Calendar's unless said. */
  view: BoardView = 'calendar',
  /** Told of every save the database took, for undo. */
  onSaved?: (change: SavedChange) => void,
) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [message, setMessage] = useState<string | null>(null);
  // Saves out, by splash, and those answered yes since their last edit.
  const [flying, setFlying] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<Record<string, true>>({});
  const told = useRef(onSaved);
  useEffect(() => {
    told.current = onSaved;
  }, [onSaved]);
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

  /**
   * A change: drawn now, saved once the sliders rest. On Home my first
   * change makes a Home layout of my own. A handle holds its change while
   * it is down — the board and the sliders follow it, nothing is sent —
   * and `commit` sends it the moment it is let go (review: one save a release).
   */
  const edit = useCallback(
    (id: string, patch: BoardLayoutJson, clear: string[] = [], how: EditHow = {}): void => {
      setMessage(null);
      setSaved((all) => (all[id] ? omit(all, id) : all));
      setDrafts((all) => {
        const was = all[id];
        const start = was?.layout ?? shown(id).layout;
        const set = setPaths(patch);
        return {
          ...all,
          [id]: {
            layout: clearLayout(mergeLayout(start, patch), clear),
            patch: clearLayout(mergeLayout(was?.patch ?? {}, patch), clear),
            clear: [...(was?.clear ?? []).filter((path) => !set.has(path)), ...clear],
            version: (was?.version ?? 0) + 1,
            sent: was?.sent ?? 0,
            base: was?.base ?? start,
            held: how.hold === true,
            now: how.now === true || (was?.now === true && !how.hold),
            untracked: how.untracked === true || was?.untracked === true,
          },
        };
      });
    },
    [shown],
  );

  /** A handle let go: what it held is saved now. */
  const commit = useCallback((id: string): void => {
    setDrafts((all) => (all[id] ? { ...all, [id]: { ...all[id], held: false, now: true } } : all));
  }, []);

  // The rest: every edit restarts the wait; when it runs out, each draft not
  // yet sent at its latest version is saved.
  // A handle let go, or an undo, is saved at once; a slider's edit after the rest.
  useEffect(() => {
    const due = Object.entries(drafts).filter(([, d]) => d.version !== d.sent && !d.held);
    if (due.length === 0) return;
    const wait = due.some(([, d]) => d.now) ? 0 : LAYOUT_SAVE_MS;
    const timer = window.setTimeout(() => {
      for (const [id, draft] of due) {
        // What follows this save is a change of its own, from what this one leaves.
        setDrafts((all) =>
          all[id]
            ? {
                ...all,
                [id]: {
                  ...all[id],
                  sent: draft.version,
                  base: draft.layout,
                  now: false,
                  untracked: false,
                },
              }
            : all,
        );
        setFlying((all) => ({ ...all, [id]: (all[id] ?? 0) + 1 }));
        startTransition(async () => {
          hold({ id, shown: { layout: draft.layout, source } });
          const result = await setBoardLayout({
            splashId: id,
            poolId,
            patch: draft.patch,
            clear: draft.clear,
            view,
          });
          setFlying((all) => (all[id] > 1 ? { ...all, [id]: all[id] - 1 } : omit(all, id)));
          if (result.ok) {
            // Said in the toolbar, never a toast (review): "Saving…", then "Saved".
            setSaved((all) => ({ ...all, [id]: true }));
            if (!draft.untracked)
              told.current?.({ id, before: draft.base, paths: pathsOf(draft.patch, draft.clear) });
            router.refresh();
          } else {
            setMessage(result.message);
            // A refusal is the one thing a toast says (review).
            toast.show(result.message);
          }
          // Dropped once answered — unless the hand moved again meanwhile.
          setDrafts((all) => (all[id]?.version !== draft.version ? all : omit(all, id)));
        });
      }
    }, wait);
    return () => window.clearTimeout(timer);
  }, [drafts, hold, poolId, router, source, toast, view]);

  /** "Use pool layout": my Home layout gone; the pool's is drawn again at once. */
  const revertToPool = useCallback(
    (id: string): void => {
      const card = byId.get(id);
      const before = shown(id).layout;
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
        const result = await revertToPoolLayout(id, view);
        if (result.ok) {
          // Undone by writing my Home layout back, whole.
          told.current?.({ id, before, paths: ['piece', 'icon', 'label', 'photos', 'wave'] });
          router.refresh();
        } else {
          setMessage(result.message);
          toast.show(result.message);
        }
      });
    },
    [byId, hold, router, shown, toast, view],
  );

  /** What the toolbar says of a splash's layout: on its way, saved, or nothing. */
  const status = useCallback(
    (id: string): SaveStatus => {
      const draft = drafts[id];
      if (flying[id] || (draft && !draft.held)) return 'saving';
      return saved[id] ? 'saved' : null;
    },
    [drafts, flying, saved],
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

  return {
    drawn,
    shown,
    edit,
    commit,
    revertToPool,
    status,
    message,
    saving,
    unsaved: Object.keys(drafts),
  };
}

export type LayoutDrafts = ReturnType<typeof useLayoutDrafts>;

function omit<T>(all: Record<string, T>, id: string): Record<string, T> {
  const next = { ...all };
  delete next[id];
  return next;
}
