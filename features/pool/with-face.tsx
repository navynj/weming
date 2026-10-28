'use client';

import { Avatar } from '@/features/people/avatar';

/**
 * A member on a With line (review): their face — the photo when they have
 * one, else initials — with their name under it. Picked, an ink ring and the
 * name in ink: ink is selection (H20f).
 */
export function WithFace({
  id,
  name,
  initials,
  on,
  disabled = false,
  onToggle,
  data,
}: {
  id: string;
  name: string;
  initials: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
  /** The attribute it is found by: `data-together-face` or `data-audience-face`. */
  data: 'together' | 'audience';
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={name}
      {...(data === 'together' ? { 'data-together-face': id } : { 'data-audience-face': id })}
      disabled={disabled}
      onClick={onToggle}
      className="flex w-12 shrink-0 flex-col items-center gap-1 disabled:cursor-default"
    >
      <Avatar
        id={id}
        initials={initials}
        // 32px on a phone, 36px wide (review).
        className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold lg:h-9 lg:w-9 lg:text-xs ${
          on ? 'bg-ink ring-ink text-white ring-2 ring-offset-2' : 'bg-pool-100 text-pool-500'
        }`}
      />
      <span
        data-with-name
        className={`w-full truncate text-center text-[11px] ${on ? 'text-ink font-semibold' : 'text-pool-500'}`}
      >
        {name}
      </span>
    </button>
  );
}
