'use client';

/**
 * A switch: blue when on — it commits a choice — pale when off; `tone="ink"`
 * when it selects rather than commits (H20f).
 */
export function Switch({
  on,
  onChange,
  label,
  disabled = false,
  tone = 'blue',
  size = 'md',
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
  tone?: 'blue' | 'ink';
  size?: 'md' | 'sm';
}) {
  const sm = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        sm ? 'h-5 w-9' : 'h-7 w-12'
      } ${on ? (tone === 'ink' ? 'bg-ink' : 'bg-main-900') : 'bg-pool-200'}`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 rounded-full bg-white shadow-sm transition-[left] ${
          sm ? 'h-4 w-4' : 'h-6 w-6'
        } ${on ? (sm ? 'left-[18px]' : 'left-[22px]') : 'left-0.5'}`}
      />
    </button>
  );
}
