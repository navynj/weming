'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Check, Undo2, X } from 'lucide-react';

import { PartChips } from './board-handles';
import { LayoutControls, type LayoutControlsProps } from './layout-controls';
import { layoutTitle } from './layout-panel';
import { LayerSection } from './layer-section';
import type { BoardEditing } from './use-board-editing';

/** A header button: a finger's 44px. */
const HEAD_BUTTON = 'flex h-11 min-w-11 items-center justify-center rounded-full';

/**
 * More, on a phone (review, 2026-10-27): every slider the desktop panel
 * holds — offsets, tilts, sizes, text size, the wave, each photo, Reset all,
 * Use pool layout — in a low sheet of the water's own colour with no scrim,
 * so the board above stays in view and moves as a slider does, and its
 * handles move the sliders back. It covers the toolbar's lower row, so its
 * header holds Undo and Done beside Close (review): Done ends the editing,
 * and the sheet with it; Close only closes the sheet. The layer buttons sit
 * at its top, and the part chips too when the toolbar's row of them is not
 * in sight above it.
 */
export function LayoutSheet({
  view,
  onClose,
  editing = null,
  ...controls
}: LayoutControlsProps & {
  view: 'calendar' | 'lane' | 'members';
  onClose: () => void;
  /** The board's editing: Undo, Done, the active piece's layer moves and part chips. */
  editing?: BoardEditing | null;
}) {
  const sheet = useRef<HTMLElement>(null);
  // Whether the toolbar's chips row shows whole above the sheet, read as
  // drawn: on open, once the sheet has risen, and as the board scrolls.
  const [chipsAbove, setChipsAbove] = useState(false);
  const check = useCallback((): void => {
    const top = sheet.current?.getBoundingClientRect().top ?? 0;
    const r = document
      .querySelector('[data-edit-toolbar] [data-edit-parts]')
      ?.getBoundingClientRect();
    const seen = !!r && r.height > 0 && r.top >= 0 && r.bottom <= top;
    setChipsAbove((current) => (current === seen ? current : seen));
  }, []);
  const parts = editing?.parts ?? null;
  const selected = editing?.part;
  useLayoutEffect(() => {
    check();
    window.addEventListener('scroll', check, true);
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check, true);
      window.removeEventListener('resize', check);
    };
  }, [check, parts, selected]);
  const showChips = parts !== null && parts.length > 1 && !chipsAbove;
  return (
    <section
      ref={sheet}
      role="dialog"
      aria-label={layoutTitle(view)}
      data-layout-sheet={controls.card.splash.id}
      onAnimationEnd={check}
      className="sheet-rise bg-main-900 fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[50vh] w-full max-w-xl flex-col rounded-t-[24px] text-white shadow-[0_-8px_24px_rgba(0,0,0,0.25)]"
    >
      <header className="flex shrink-0 items-center gap-1 pt-1 pr-2 pb-1 pl-4">
        <h2 className="flex-1 text-sm font-semibold">{layoutTitle(view)}</h2>
        {editing ? (
          <>
            <button
              type="button"
              aria-label="Undo"
              data-layout-sheet-undo
              disabled={!editing.canUndo}
              onClick={editing.undo}
              className={`${HEAD_BUTTON} disabled:opacity-20`}
            >
              <Undo2 aria-hidden size={18} />
            </button>
            <button
              type="button"
              data-layout-sheet-done
              // Ends the editing; the ground closes the sheet with it.
              onClick={editing.deactivate}
              className={`${HEAD_BUTTON} gap-1 px-3 text-sm font-semibold`}
            >
              <Check aria-hidden size={16} />
              Done
            </button>
          </>
        ) : null}
        <button
          type="button"
          aria-label="Close"
          data-layout-sheet-close
          onClick={onClose}
          className={HEAD_BUTTON}
        >
          <X aria-hidden size={18} />
        </button>
      </header>
      <div
        data-layout-body
        className="no-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto px-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {showChips && editing ? (
          <div
            data-layout-parts
            role="group"
            aria-label="Part"
            className="no-scrollbar -mx-1 flex shrink-0 items-center overflow-x-auto"
          >
            <PartChips parts={parts} editing={editing} tall muted="text-white/70" />
          </div>
        ) : null}
        {editing?.layers ? <LayerSection layers={editing.layers} /> : null}
        <LayoutControls {...controls} />
      </div>
    </section>
  );
}
