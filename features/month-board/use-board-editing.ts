'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BoardView } from '@/lib/queries/layouts';

import { isPeriod, type BoardLayoutJson } from './board-layout';
import {
  LABEL_PART,
  nudged,
  partPatch,
  partValues,
  restoring,
  type BoardPart,
} from './handle-math';
import type { LayerControls } from './stacking';
import type { LayoutDrafts, SavedChange, SaveStatus } from './use-layout-drafts';

/** How many changes a piece keeps to undo, per view (review). */
export const UNDO_DEPTH = 20;

/**
 * The changes to undo (review): per piece and view, the last twenty saves
 * the database took, kept until the page is left. The drafts report each
 * save here; an undo's own write is never one.
 */
export function useLayoutHistory() {
  const [changes, setChanges] = useState<Record<string, SavedChange[]>>({});
  const record = useCallback(
    (view: BoardView) =>
      (change: SavedChange): void =>
        setChanges((all) => {
          const key = `${view}:${change.id}`;
          return { ...all, [key]: [...(all[key] ?? []), change].slice(-UNDO_DEPTH) };
        }),
    [],
  );
  // One recorder per view, the same each render, for the drafts hooks.
  const recorders = useMemo(
    () => ({ calendar: record('calendar'), lane: record('lane'), members: record('members') }),
    [record],
  );
  const last = useCallback(
    (view: BoardView, id: string): SavedChange | null => changes[`${view}:${id}`]?.at(-1) ?? null,
    [changes],
  );
  const drop = useCallback((view: BoardView, id: string): void => {
    setChanges((all) => {
      const key = `${view}:${id}`;
      return { ...all, [key]: (all[key] ?? []).slice(0, -1) };
    });
  }, []);
  return { recorders, last, drop };
}
export type LayoutHistory = ReturnType<typeof useLayoutHistory>;

/** What the board's pieces are told while one of them is being edited by hand. */
export type BoardEditing = {
  activeId: string | null;
  part: BoardPart;
  /** A tap on a piece, or on one of its parts. */
  tap: (id: string, part?: BoardPart) => void;
  deactivate: () => void;
  /** A handle moving: drawn at once, the sliders following; nothing sent. */
  hold: (patch: BoardLayoutJson) => void;
  /** A handle let go: one save. */
  commit: () => void;
  /**
   * A part's place kept as its size changes (review): written into the
   * handle's run of edits as it stands, held while held, saved with the release.
   */
  adjust: (patch: BoardLayoutJson) => void;
  /** The text size stepper: saved after the rest, as a slider is. */
  edit: (patch: BoardLayoutJson) => void;
  undo: () => void;
  canUndo: boolean;
  status: SaveStatus;
  more: () => void;
  /** The active piece's layer moves, on a phone, where More shows them (review). */
  layers: LayerControls | null;
  /** The active piece offers them (or takes them back, null). */
  offerLayers: (layers: LayerControls | null) => void;
};

const TYPING = 'input, textarea, select, [contenteditable="true"]';

/**
 * Direct manipulation on the board (review, 2026-10-27), with no mode of
 * its own: a first tap on a piece brings its record to the top of the
 * stack, as ever; a tap on the piece already on top makes it active — an
 * outline, handles and a small toolbar — when I may edit its layout. A tap
 * on empty board, Escape, Done or another piece (which comes to the top
 * without handles) lets it go, and so does the stack turning to another
 * card. Every write goes through the view's drafts, so the sliders and the
 * handles show one value.
 */
export function useBoardEditing({
  drafts,
  history,
  view,
  topId,
  canEdit,
  onPick,
  onMore,
}: {
  drafts: LayoutDrafts;
  history: LayoutHistory;
  view: BoardView;
  /** The stack's top card. */
  topId: string | null;
  /** A pool's current member, or Home, where every edit is mine. */
  canEdit: boolean;
  /** Brings a record's card to the top of the stack. */
  onPick: (id: string) => void;
  /** More: the panel on a desktop, the sheet on a phone. */
  onMore: () => void;
}): BoardEditing {
  const [active, setActive] = useState<{ id: string; part: BoardPart } | null>(null);
  const [layers, setLayers] = useState<LayerControls | null>(null);
  const offerLayers = useCallback((next: LayerControls | null): void => setLayers(next), []);
  const activeId = active && active.id === topId && canEdit ? active.id : null;
  const part = activeId ? active!.part : LABEL_PART;
  // Let go once the stack turns to another card, or the views change under
  // it: set as it renders, so a stale piece never draws its handles.
  if (active && !activeId) setActive(null);
  const [seenView, setSeenView] = useState(view);
  if (view !== seenView) {
    setSeenView(view);
    setActive(null);
  }

  const tap = useCallback(
    (id: string, tapped: BoardPart = LABEL_PART): void => {
      if (activeId === id) setActive({ id, part: tapped });
      else if (id === topId && canEdit) setActive({ id, part: tapped });
      else {
        setActive(null);
        onPick(id);
      }
    },
    [activeId, topId, canEdit, onPick],
  );
  const deactivate = useCallback((): void => setActive(null), []);

  // The piece a handle holds: a release still settling saves it even if it was let go meanwhile.
  const held = useRef<string | null>(null);
  const hold = useCallback(
    (patch: BoardLayoutJson): void => {
      if (!activeId) return;
      held.current = activeId;
      drafts.edit(activeId, patch, [], { hold: true });
    },
    [activeId, drafts],
  );
  const commit = useCallback((): void => {
    const id = held.current ?? activeId;
    held.current = null;
    if (id) drafts.commit(id);
  }, [activeId, drafts]);
  const edit = useCallback(
    (patch: BoardLayoutJson): void => {
      if (activeId) drafts.edit(activeId, patch);
    },
    [activeId, drafts],
  );
  const adjust = useCallback(
    (patch: BoardLayoutJson): void => {
      const id = held.current ?? activeId;
      if (id) drafts.edit(id, patch, [], { keep: true });
    },
    [activeId, drafts],
  );

  const last = activeId ? history.last(view, activeId) : null;
  const undo = useCallback((): void => {
    if (!activeId || !last) return;
    const { patch, clear } = restoring(last.before, last.paths);
    history.drop(view, activeId);
    drafts.edit(activeId, patch, clear, { now: true, untracked: true });
  }, [activeId, last, history, view, drafts]);

  // The keyboard, on a desktop (review): arrows move the selected part a
  // slider's step, ten with Shift; [ and ] turn it a degree; Escape lets
  // go; Cmd/Ctrl+Z undoes. A focused slider keeps its own arrows.
  const latest = useRef({ activeId, part, undo, drafts });
  useEffect(() => {
    latest.current = { activeId, part, undo, drafts };
  });
  useEffect(() => {
    if (!activeId) return;
    const onKey = (event: KeyboardEvent): void => {
      const { activeId: id, part: selected, undo: undoNow, drafts: d } = latest.current;
      if (!id) return;
      const target = event.target as Element | null;
      if (target?.closest?.(TYPING)) return;
      if (event.key === 'Escape') {
        setActive(null);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoNow();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const card = d.drawn.find((c) => c.splash.id === id);
      // A band along its days moves nowhere by hand (the panel's own rule).
      if (!card || isPeriod(card.splash)) return;
      const next = nudged(partValues(d.shown(id).layout, selected), event.key, event.shiftKey);
      if (!next) return;
      event.preventDefault();
      d.edit(id, partPatch(selected, next));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId]);

  return {
    activeId,
    part,
    tap,
    deactivate,
    hold,
    commit,
    adjust,
    edit,
    undo,
    canUndo: last !== null,
    status: activeId ? drafts.status(activeId) : null,
    more: onMore,
    layers: activeId ? layers : null,
    offerLayers,
  };
}
