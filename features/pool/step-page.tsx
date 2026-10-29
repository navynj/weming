import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * A step's white page (1c, 1d): the back chevron at the top left, the step
 * indicator at the top right, both in blue; the content in one column; the
 * primary action at the foot. On a wide screen the column stays phone-wide.
 */
export function StepPage({
  step,
  onBack,
  title = null,
  wide = false,
  children,
}: {
  /** "1 / 2", or null for a page that is not a numbered step. */
  step: string | null;
  /** The page's name in the bar, centred: what this place is ("Join Pool"). */
  title?: string | null;
  onBack: () => void;
  /** Both steps side by side on a wide screen (review): wider, and no step count there. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={`mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white px-6 ${wide ? 'lg:max-w-5xl' : ''}`}
      style={{
        paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="text-main-900 relative flex h-10 items-center justify-between">
        <button type="button" aria-label="Back" onClick={onBack} className="-ml-2 p-2">
          <ChevronLeft aria-hidden size={22} strokeWidth={2.5} />
        </button>
        {title ? (
          <h1
            data-step-title
            className="pointer-events-none absolute inset-x-12 text-center text-base font-semibold"
          >
            {title}
          </h1>
        ) : null}
        {step ? (
          <span
            data-step
            className={`text-base font-semibold tabular-nums ${wide ? 'lg:hidden' : ''}`}
          >
            {step}
          </span>
        ) : null}
      </div>
      <div className="mt-8 flex min-h-0 flex-1 flex-col">{children}</div>
    </main>
  );
}

/** The one primary action at a step's foot: blue, because it commits (H20f). */
export function PrimaryButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-primary
      disabled={disabled}
      onClick={onClick}
      className="bg-main-900 h-16 w-full rounded-full text-lg font-semibold text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}
