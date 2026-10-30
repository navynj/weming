'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { usePeople } from '@/features/people/people-provider';

import { isOneEmoji, lastGrapheme, QUICK_EMOJI, type ReactionChip } from './model';

/** Held this long, a chip says who reacted instead of toggling (H25). */
const LONG_PRESS_MS = 450;

const CHIP =
  'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs leading-none tabular-nums';

/**
 * Under a block (H25): each emoji left on it as a small chip — the emoji and
 * how many, mine filled in ink, the selection channel (H20f) — then a "+"
 * chip that opens the picker. A tap toggles mine; a long press, or a hover
 * on a desktop, says who.
 */
export function ReactionChips({
  chips,
  canReact,
  onToggle,
  floating = false,
  leading = null,
}: {
  chips: ReactionChip[];
  canReact: boolean;
  onToggle: (emoji: string) => void;
  /**
   * At the row's left end: the "Reply" that opens the reply field. The chips
   * keep to the right end, with it or without (Yoonji, in the session).
   */
  leading?: React.ReactNode;
  /**
   * The picker and the who-reacted list float over the page, where the chips
   * sit in something that clips: the top card, cut at its fixed height.
   */
  floating?: boolean;
}) {
  const { people, me } = usePeople();
  const [picking, setPicking] = useState(false);
  const [showing, setShowing] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<CSSProperties | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  /** Shown by a mouse's hover, so its leaving takes it away; a long press stays. */
  const hovered = useRef(false);

  /** Where a floating popover sits: under the chips, at the row's right end, kept on screen. */
  function place(): void {
    const box = row.current?.getBoundingClientRect();
    if (!box) return;
    setAnchor({
      position: 'fixed',
      top: box.bottom + 4,
      right: Math.max(8, window.innerWidth - box.right),
    });
  }
  const pop = (node: React.ReactNode): React.ReactNode =>
    floating && anchor ? createPortal(node, document.body) : node;
  const nameOf = (id: string): string => (id === me ? 'You' : (people[id]?.name ?? 'Someone'));

  if (chips.length === 0 && !canReact && !leading) return null;

  function press(emoji: string): void {
    held.current = false;
    timer.current = setTimeout(() => {
      held.current = true;
      if (floating) place();
      setShowing(emoji);
    }, LONG_PRESS_MS);
  }

  // A desktop's hover says who at once (2026-10-29); touch has no hover, a long press does.
  function enter(event: React.PointerEvent, emoji: string): void {
    if (event.pointerType !== 'mouse') return;
    hovered.current = true;
    if (floating) place();
    setShowing(emoji);
  }

  function leave(): void {
    if (timer.current) clearTimeout(timer.current);
    if (!hovered.current) return;
    hovered.current = false;
    setShowing(null);
  }

  function release(emoji: string): void {
    if (timer.current) clearTimeout(timer.current);
    if (!held.current && canReact) onToggle(emoji);
  }

  function pick(emoji: string): void {
    setPicking(false);
    const mine = chips.find((c) => c.emoji === emoji)?.mine;
    // From the picker an emoji is always added: one already mine stays.
    if (!mine) onToggle(emoji);
  }

  return (
    <div ref={row} data-reactions className="relative flex grow flex-wrap items-center gap-1.5">
      {leading}
      <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.emoji}
            type="button"
            data-reaction={chip.emoji}
            data-mine={chip.mine ? '' : undefined}
            aria-pressed={chip.mine}
            aria-label={`${chip.emoji} ${chip.count}`}
            // A keyboard's Enter or Space has no pointer: it toggles here.
            onClick={(event) => event.detail === 0 && canReact && onToggle(chip.emoji)}
            onPointerDown={() => press(chip.emoji)}
            onPointerUp={() => release(chip.emoji)}
            onPointerEnter={(event) => enter(event, chip.emoji)}
            onPointerLeave={leave}
            onContextMenu={(event) => event.preventDefault()}
            className={`${CHIP} select-none ${
              chip.mine ? 'bg-ink text-white' : 'border-pool-200 text-ink border bg-white'
            }`}
          >
            <span aria-hidden>{chip.emoji}</span>
            <span>{chip.count}</span>
          </button>
        ))}
        {canReact ? (
          <button
            type="button"
            data-reaction-add
            aria-label="Add a reaction"
            aria-expanded={picking}
            onClick={() => {
              if (floating) place();
              setPicking((open) => !open);
            }}
            className={`${CHIP} border-pool-200 text-pool-500 border bg-white`}
          >
            +
          </button>
        ) : null}
      </span>

      {picking
        ? pop(
            <Picker
              onPick={pick}
              onClose={() => setPicking(false)}
              style={floating ? anchor : null}
            />,
          )
        : null}

      {showing
        ? pop(
            <div
              role="dialog"
              aria-label="Who reacted"
              data-reaction-who
              onClick={() => setShowing(null)}
              style={floating && anchor ? anchor : undefined}
              className={`border-pool-200 text-ink z-50 flex flex-col gap-0.5 rounded-lg border bg-white px-3 py-2 text-xs shadow-sm ${
                floating && anchor ? '' : 'absolute top-full right-0 mt-1'
              }`}
            >
              {chips
                .find((c) => c.emoji === showing)
                ?.who.map((id) => (
                  <span key={id}>
                    {showing} {nameOf(id)}
                  </span>
                ))}
            </div>,
          )
        : null}
    </div>
  );
}

/** Six quick ones, then a field the native keyboard fills with any emoji (H25). */
function Picker({
  onPick,
  onClose,
  style = null,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Floating: fixed where its chips are, over everything. */
  style?: CSSProperties | null;
}) {
  const [draft, setDraft] = useState('');
  return (
    <div
      role="dialog"
      aria-label="Pick a reaction"
      data-reaction-picker
      style={style ?? undefined}
      className={`border-pool-200 z-50 flex items-center gap-1 rounded-full border bg-white p-1 shadow-sm ${
        style ? '' : 'absolute top-full right-0 mt-1'
      }`}
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
    >
      {QUICK_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          data-reaction-quick={emoji}
          onClick={() => onPick(emoji)}
          className="hover:bg-pool-100 flex h-8 w-8 items-center justify-center rounded-full text-lg"
        >
          {emoji}
        </button>
      ))}
      <input
        aria-label="Any emoji"
        data-reaction-field
        value={draft}
        maxLength={16}
        placeholder="🙂"
        onChange={(event) => {
          // One grapheme: the newest typed. An emoji is taken at once.
          const one = lastGrapheme(event.target.value);
          if (isOneEmoji(one)) onPick(one);
          else setDraft(one);
        }}
        className="border-pool-200 h-8 w-10 rounded-full border text-center text-base outline-none"
      />
    </div>
  );
}
