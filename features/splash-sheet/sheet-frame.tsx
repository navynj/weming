'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { COLUMN_MAX_WIDTH } from '@/components/ui/column';

/**
 * A bottom sheet never covers the whole screen (review): at most the visible
 * viewport — the keyboard's room taken out — less a 56px band at the top
 * (the notch's, where it is taller), where the dimmed screen stays in view
 * and a tap on it closes the sheet. One expression, so the test and the
 * screen agree on it; `--sheet-room` is the visual viewport's height, set by
 * the frame, and the dynamic viewport before it is measured.
 */
export const SHEET_TOP_GAP_PX = 56;
export const SHEET_MAX_HEIGHT =
  'max-h-[calc(var(--sheet-room,100dvh)-max(56px,env(safe-area-inset-top,0px)))]';

/** The bottom inset a sheet's last row keeps above the home indicator. */
const BOTTOM_PAD = 'calc(1.75rem + env(safe-area-inset-bottom, 0px))';

/**
 * A white bottom sheet on the dimmed ground (SPEC 6), sized to the visual
 * viewport: when the keyboard opens it shrinks with the viewport and sits on
 * the keyboard instead of pushing its top off screen, and the field in focus
 * is scrolled into what remains. Its content scrolls inside it; a
 * `SheetFooter` stays pinned to its bottom.
 */
export function SheetFrame({
  label,
  onClose,
  data,
  className = '',
  bodyClassName = 'px-7 pt-8',
  footer = false,
  children,
}: {
  label: string;
  onClose: () => void;
  /** The attributes the section is found by. */
  data?: Record<`data-${string}`, string>;
  className?: string;
  bodyClassName?: string;
  /** Ends in a `SheetFooter`, which keeps the bottom inset itself. */
  footer?: boolean;
  children: ReactNode;
}) {
  const section = useRef<HTMLElement>(null);
  const viewport = useVisualViewport(section);
  return (
    <div
      data-sheet-frame
      className="fixed inset-x-0 top-0 z-40 flex flex-col justify-end"
      style={
        {
          bottom: viewport?.bottom ?? 0,
          '--sheet-room': viewport ? `${viewport.height}px` : undefined,
        } as CSSProperties
      }
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bg-main-900/60 scrim-in fixed inset-0"
      />
      <section
        ref={section}
        role="dialog"
        aria-label={label}
        {...data}
        className={`sheet-rise relative mx-auto flex w-full ${COLUMN_MAX_WIDTH} ${SHEET_MAX_HEIGHT} flex-col overflow-hidden rounded-t-[32px] bg-white ${className}`}
      >
        <div
          data-sheet-scroll
          className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${bodyClassName}`}
          style={footer ? undefined : { paddingBottom: BOTTOM_PAD }}
        >
          {children}
        </div>
      </section>
    </div>
  );
}

/**
 * The sheet's commit row (Drop; Cancel and Save), pinned to its bottom while
 * the content scrolls above it, so it is in reach with the keyboard up.
 */
export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div
      data-sheet-footer
      className="sticky bottom-0 z-10 -mx-7 mt-auto bg-white px-7 pt-3"
      style={{ paddingBottom: BOTTOM_PAD }}
    >
      {children}
    </div>
  );
}

/** The visual viewport's height and its distance from the layout viewport's bottom (the keyboard). */
function useVisualViewport(
  within: React.RefObject<HTMLElement | null>,
): { bottom: number; height: number } | null {
  const [viewport, setViewport] = useState<{ bottom: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const keepFocusInView = (): void => {
      const active = document.activeElement as HTMLElement | null;
      if (active && within.current?.contains(active) && active.matches('input, textarea')) {
        active.scrollIntoView({ block: 'nearest' });
      }
    };
    const update = (): void => {
      setViewport({
        bottom: Math.max(0, window.innerHeight - vv.height - vv.offsetTop),
        height: vv.height,
      });
      // After the sheet has taken its new size.
      requestAnimationFrame(keepFocusInView);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [within]);
  return viewport;
}
