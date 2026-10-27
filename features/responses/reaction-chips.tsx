'use client';

import { useRef, useState } from 'react';

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
}: {
  chips: ReactionChip[];
  canReact: boolean;
  onToggle: (emoji: string) => void;
}) {
  const { people, me } = usePeople();
  const [picking, setPicking] = useState(false);
  const [showing, setShowing] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const nameOf = (id: string): string => (id === me ? 'You' : (people[id]?.name ?? 'Someone'));

  if (chips.length === 0 && !canReact) return null;

  function press(emoji: string): void {
    held.current = false;
    timer.current = setTimeout(() => {
      held.current = true;
      setShowing(emoji);
    }, LONG_PRESS_MS);
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
    <div data-reactions className="relative flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.emoji}
          type="button"
          data-reaction={chip.emoji}
          data-mine={chip.mine ? '' : undefined}
          aria-pressed={chip.mine}
          aria-label={`${chip.emoji} ${chip.count}`}
          title={chip.who.map(nameOf).join(', ')}
          // A keyboard's Enter or Space has no pointer: it toggles here.
          onClick={(event) => event.detail === 0 && canReact && onToggle(chip.emoji)}
          onPointerDown={() => press(chip.emoji)}
          onPointerUp={() => release(chip.emoji)}
          onPointerLeave={() => timer.current && clearTimeout(timer.current)}
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
          onClick={() => setPicking((open) => !open)}
          className={`${CHIP} border-pool-200 text-pool-500 border bg-white`}
        >
          +
        </button>
      ) : null}

      {picking ? <Picker onPick={pick} onClose={() => setPicking(false)} /> : null}

      {showing ? (
        <div
          role="dialog"
          aria-label="Who reacted"
          data-reaction-who
          onClick={() => setShowing(null)}
          className="border-pool-200 text-ink absolute top-full left-0 z-10 mt-1 flex flex-col gap-0.5 rounded-lg border bg-white px-3 py-2 text-xs shadow-sm"
        >
          {chips
            .find((c) => c.emoji === showing)
            ?.who.map((id) => (
              <span key={id}>
                {showing} {nameOf(id)}
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}

/** Six quick ones, then a field the native keyboard fills with any emoji (H25). */
function Picker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState('');
  return (
    <div
      role="dialog"
      aria-label="Pick a reaction"
      data-reaction-picker
      className="border-pool-200 absolute top-full left-0 z-10 mt-1 flex items-center gap-1 rounded-full border bg-white p-1 shadow-sm"
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
