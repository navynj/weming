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

/** How long "Saved" stays: long enough to read, short enough to forget. */
const SHOWN_MS = 1800;

type ToastApi = { show: (message: string) => void };

/** Outside a provider (a test, a page with none) a toast is simply not shown. */
const ToastContext = createContext<ToastApi>({ show: () => {} });

/**
 * A quiet confirmation for a change that saves on its own, with no Save
 * button to press (Yoonji, in the session): the theme, a description, an
 * inline title, Audience, a layout. One line at the foot, then gone. A
 * refusal is never a toast: it is said where the change was made.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const show = useCallback((next: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    setMessage(next);
    timer.current = window.setTimeout(() => setMessage(null), SHOWN_MS);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
        style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {message ? (
          <p
            role="status"
            data-toast
            className="bg-ink rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg"
          >
            {message}
          </p>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
