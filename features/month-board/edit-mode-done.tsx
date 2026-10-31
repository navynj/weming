'use client';

/**
 * A phone's edit mode (review, 2026-10-31): in the stack's place while the
 * board is edited, one wide white button that leaves the mode. Every change
 * is already saved as it rests (the drafts), so leaving is all it does.
 */
export function EditModeDone({ onDone }: { onDone: () => void }) {
  return (
    <div data-edit-mode-done className="relative z-10 shrink-0 px-4">
      <button
        type="button"
        onClick={onDone}
        // On the water, white carries action (H21c), as the compose disc.
        className="text-main-900 flex h-14 w-full items-center justify-center rounded-[22px] bg-white text-base font-semibold"
      >
        Done editing
      </button>
    </div>
  );
}
