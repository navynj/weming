'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { MotionConfig, animate, motion, useDragControls, type PanInfo } from 'motion/react';

import { usePrefersReducedMotion } from '@/components/ui/waves/use-reduced-motion';
import { FLIP_SPRING } from '@/features/home/use-flip';
import { useInputSheet } from '@/features/input-sheet/sheet-provider';

/** A pull past this, or a flick faster than this, lets the sheet go. */
const DISMISS_PX = 120;
const DISMISS_VELOCITY = 600;
/** How far a press must travel down before it is a drag, not a tap or a scroll. */
const DRAG_START_PX = 8;

const Close = createContext<(() => void) | null>(null);

/** Closes the splash sheet this is inside (its delete, for one), or null outside one. */
export function useCloseSplash(): (() => void) | null {
  return useContext(Close);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A splash's detail as a bottom sheet over the screen it was opened from
 * (review): Home, a pool or a lane page stay exactly as they were beneath.
 * The URL is the splash's own, so the back button closes it and a link to it
 * works; `closeTo` is where a direct visit goes when closed (its context),
 * and null means back, the screen it was opened over.
 *
 * It fits its content up to 92dvh on a phone and 88dvh on a wide screen,
 * where it is min(1040px, 90vw) wide and keeps the detail's two halves. The
 * header stays pinned while the body scrolls. Dismissed by dragging down the
 * handle or the header, or the body once scrolled to its top; by the dimmed
 * screen; by Escape; by back. It opens and closes on the board's spring, a
 * fade under reduced motion; above the keyboard it sizes itself to the
 * visual viewport so the editor in focus stays in view. Focus is held inside
 * and given back to what opened it; the screen behind does not scroll.
 */
export function SplashModal({
  closeTo,
  onLeave,
  children,
}: {
  closeTo: string | null;
  /** How it leaves when not by a route of its own (the settings sheet, 0059): its own history step. */
  onLeave?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const reduce = usePrefersReducedMotion();
  const controls = useDragControls();
  const { sheet: compose } = useInputSheet();
  const frame = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Set when the sheet closes itself: its own exit has already played.
  const closing = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const press = useRef<{ y: number; header: boolean; atTop: boolean; dragging: boolean } | null>(
    null,
  );
  const [leaving, setLeaving] = useState(false);
  // While it leaves, the sheet keeps what it showed: a delete from inside it
  // re-reads the route as it closes, and the swap must not flash (review).
  const [held, setHeld] = useState<ReactNode>(null);
  const [viewport, setViewport] = useState<{ bottom: number; height: number } | null>(null);

  const close = useCallback(() => {
    closing.current = true;
    setHeld(children);
    setLeaving(true);
  }, [children]);
  const leave = useCallback(() => {
    if (onLeave) onLeave();
    else if (closeTo) router.replace(closeTo, { scroll: false });
    else router.back();
  }, [closeTo, onLeave, router]);

  // The screen behind holds still; focus comes in, and goes back on close.
  // Closed by the route instead (back, or any navigation away), the sheet is
  // already gone when this runs, so it leaves a still copy of itself to play
  // the exit on (review): the back button closes with the same spring.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const before = root.style.overflow;
    const node = frame.current;
    const body = scroller.current;
    root.style.overflow = 'hidden';
    panel.current?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = before;
      opener?.focus?.({ preventScroll: true });
      // Only a real removal: React's development double-run of effects
      // cleans up while the sheet is still on the page, and must not play it.
      if (!closing.current && node && !node.isConnected) playExit(node, body?.scrollTop ?? 0);
    };
  }, []);

  // Escape closes — not while the compose sheet is up over it, nor while a
  // field is being written in.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || compose) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, compose]);

  // Above the keyboard: the visual viewport sizes and lifts the sheet, and
  // the field in focus is scrolled into what remains.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setViewport({
        bottom: Math.max(0, window.innerHeight - vv.height - vv.offsetTop),
        height: vv.height,
      });
      const active = document.activeElement as HTMLElement | null;
      if (active && panel.current?.contains(active) && active.matches('input, textarea')) {
        active.scrollIntoView({ block: 'nearest' });
      }
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  function trapTab(event: React.KeyboardEvent): void {
    if (event.key !== 'Tab' || !panel.current) return;
    // Hidden by intent, not by layout: what is not hidden takes part.
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) =>
        !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
        getComputedStyle(el).display !== 'none',
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === panel.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onPointerDown(event: React.PointerEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('[data-sheet-handle]')) {
      controls.start(event);
      return;
    }
    press.current = {
      y: event.clientY,
      header: Boolean(target.closest('[data-splash-side]')),
      atTop: (scroller.current?.scrollTop ?? 0) <= 0,
      dragging: false,
    };
  }

  function onPointerMove(event: React.PointerEvent): void {
    const at = press.current;
    if (!at || at.dragging) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.clientY - at.y > DRAG_START_PX && (at.header || at.atTop)) {
      at.dragging = true;
      controls.start(event);
    }
  }

  function onDragEnd(_: unknown, info: PanInfo): void {
    press.current = null;
    if (info.offset.y > DISMISS_PX || info.velocity.y > DISMISS_VELOCITY) close();
  }

  // One animation for everyone: the board's spring slides it, a short fade
  // shows it; under reduced motion MotionConfig drops the slide and leaves
  // the fade (review). Never branched on the hook, whose answer can change
  // after mount and once left the sheet invisible.
  const shown = { y: 0, opacity: 1 };
  const hidden = { y: '100%', opacity: 0 };
  const transition = { y: FLIP_SPRING, opacity: { duration: 0.2, ease: 'easeOut' as const } };

  return (
    <MotionConfig reducedMotion="user">
      <Close.Provider value={close}>
        <div
          ref={frame}
          data-splash-modal
          className="fixed inset-x-0 top-0 z-30 flex flex-col items-center justify-end"
          style={{ bottom: viewport?.bottom ?? 0 }}
        >
          <motion.button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            data-sheet-scrim
            onClick={close}
            className="bg-main-900/60 absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: leaving ? 0 : 1 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Splash"
            tabIndex={-1}
            data-splash-sheet
            onKeyDown={trapTab}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (press.current = null)}
            drag={reduce ? false : 'y'}
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={onDragEnd}
            initial={hidden}
            animate={leaving ? hidden : shown}
            transition={transition}
            onAnimationComplete={() => {
              if (leaving) leave();
            }}
            className="relative flex max-h-[min(92dvh,var(--sheet-room))] w-full flex-col overflow-hidden rounded-t-[32px] bg-white shadow-xl outline-none lg:max-h-[min(88dvh,var(--sheet-room))] lg:w-[min(1040px,90vw)]"
            style={
              {
                '--sheet-room': viewport ? `${viewport.height - 16}px` : '100dvh',
              } as React.CSSProperties
            }
          >
            <div className="flex shrink-0 justify-center pt-3 pb-1">
              <span
                data-sheet-handle
                aria-hidden
                className="bg-pool-200 h-1.5 w-10 cursor-grab touch-none rounded-full"
              />
            </div>
            <div
              ref={scroller}
              data-sheet-body
              className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 lg:px-10 [&_[data-splash-side]]:sticky [&_[data-splash-side]]:top-0 [&_[data-splash-side]]:z-10 [&_[data-splash-side]]:bg-white"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              {leaving ? held : children}
            </div>
          </motion.div>
        </div>
      </Close.Provider>
    </MotionConfig>
  );
}

/**
 * The exit for a sheet the route closed (review): a still, inert copy of it
 * in place, its panel sent down on the board's spring and its scrim faded —
 * a fade alone under reduced motion — then removed.
 */
export function playExit(node: HTMLElement, scrollTop: number): void {
  const ghost = node.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('data-splash-modal');
  ghost.setAttribute('data-splash-leaving', '');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.style.pointerEvents = 'none';
  document.body.appendChild(ghost);
  const body = ghost.querySelector<HTMLElement>('[data-sheet-body]');
  if (body) body.scrollTop = scrollTop;
  const sheet = ghost.querySelector<HTMLElement>('[data-splash-sheet]');
  const scrim = ghost.querySelector<HTMLElement>('[data-sheet-scrim]');
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const runs = [
    scrim ? animate(scrim, { opacity: 0 }, { duration: 0.2 }) : null,
    sheet
      ? reduce
        ? animate(sheet, { opacity: 0 }, { duration: 0.2, ease: 'easeOut' })
        : animate(
            sheet,
            { y: '100%', opacity: 0 },
            { y: FLIP_SPRING, opacity: { duration: 0.2, ease: 'easeOut' } },
          )
      : null,
  ].filter((run) => run !== null);
  void Promise.all(runs.map((run) => run.finished)).finally(() => ghost.remove());
}
