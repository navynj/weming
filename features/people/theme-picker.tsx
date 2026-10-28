'use client';

import { useState } from 'react';

import { THEMES, type ThemeColor, type ThemeMode } from '@/lib/theme';

import { useToast } from '@/components/ui/toast';

import { useTheme } from './theme-provider';

const MODES: { mode: ThemeMode; label: string }[] = [
  { mode: 'dark', label: 'Dark' },
  { mode: 'light', label: 'Light' },
  { mode: 'pastel', label: 'Pastel' },
];

/**
 * The Theme tab (0032, 0036; 0059). On Home: my colour, and on choosing
 * one, whether it applies in every pool too — "Home only" or "Home and all
 * pools" — seen by me alone. In a pool: the pool's colour, shared by its
 * members and any member's to set or clear, and my colour there, over
 * everything for me. The mode — Dark, Light or Pastel — is always mine.
 * Every choice shows at once and saves behind it (CLAUDE.md, the
 * principle); a refusal takes it back and says why. Chosen wears ink
 * (H20f). Every colour keeps 3:1 against its ground (tests/theme.test.tsx).
 */
export function ThemePicker() {
  const { mine, place, theme, chooseHome, chooseMode, choosePoolColor, chooseMyPoolColor } =
    useTheme();
  const [message, setMessage] = useState<string | null>(null);
  // A Home colour picked, waiting on where it applies.
  const [asking, setAsking] = useState<ThemeColor | null>(null);
  // The pool's default, folded until asked for (review).
  const [poolOpen, setPoolOpen] = useState(false);
  const toast = useToast();

  async function done(work: Promise<string | null>): Promise<void> {
    const refused = await work;
    setMessage(refused);
    if (!refused) toast.show('Theme saved');
  }

  return (
    <section data-theme-picker aria-label="Theme" className="flex w-full flex-col gap-6">
      {place ? (
        <>
          <Colours
            name="My color here"
            hint="Only you see it, over every other colour here."
            value={place.colors.mine}
            mode={theme.mode}
            clear="Use pool color"
            data="mine"
            onPick={(color) => void done(chooseMyPoolColor(color))}
          />
          {/* The pool's own default (review): a quiet step further, closed each
              time the sheet opens; its colour shows on the button when set. */}
          {poolOpen ? (
            <Colours
              name="Pool default color"
              hint="Everyone here sees it, unless they choose their own."
              value={place.colors.pool}
              mode={theme.mode}
              clear="None"
              data="pool"
              onPick={(color) => void done(choosePoolColor(color))}
            />
          ) : (
            <button
              type="button"
              data-theme-pool-open
              onClick={() => setPoolOpen(true)}
              className="text-main-900 flex items-center gap-2 self-start text-sm font-semibold"
            >
              {place.colors.pool ? (
                <>
                  Pool default color:
                  <span
                    aria-label={THEMES.find((t) => t.key === place.colors.pool)?.name}
                    data-theme-pool-swatch={place.colors.pool}
                    className="h-5 w-5 rounded-full"
                    style={{
                      backgroundColor:
                        theme.mode === 'pastel'
                          ? THEMES.find((t) => t.key === place.colors.pool)?.pastel.fill
                          : THEMES.find((t) => t.key === place.colors.pool)?.hex,
                    }}
                  />
                </>
              ) : (
                'Set default color for this Pool'
              )}
            </button>
          )}
        </>
      ) : (
        <>
          <Colours
            name="My color"
            value={mine.home}
            mode={theme.mode}
            data="home"
            onPick={(color) => color && setAsking(color)}
          />
          {asking ? (
            <div
              role="dialog"
              aria-label="Apply to all pools"
              data-theme-everywhere-ask
              className="bg-pool-100 flex flex-col gap-3 rounded-2xl p-4"
            >
              <p className="text-ink text-sm">Apply to all pools too? Only you will see it.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-theme-home-only
                  onClick={() => {
                    setAsking(null);
                    void done(chooseHome(asking, false));
                  }}
                  className="border-pool-200 text-ink rounded-full border px-4 py-2 text-sm font-medium"
                >
                  Home only
                </button>
                <button
                  type="button"
                  data-theme-everywhere
                  onClick={() => {
                    setAsking(null);
                    void done(chooseHome(asking, true));
                  }}
                  className="bg-main-900 rounded-full px-4 py-2 text-sm font-semibold text-white"
                >
                  Home and all pools
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-pool-500 text-xs">Mode</span>
        <div
          role="radiogroup"
          aria-label="Mode"
          className="bg-pool-100 flex w-full rounded-full p-1 text-sm font-medium"
        >
          {MODES.map(({ mode, label }) => {
            const on = mode === mine.mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={on}
                data-theme-mode={mode}
                onClick={() => void done(chooseMode(mode))}
                className={`flex-1 rounded-full py-1.5 ${on ? 'bg-ink text-white' : 'text-pool-500'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {message ? (
        <p role="alert" className="text-ink text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}

/** Twelve colours as swatches, the chosen one ringed in ink; `clear` offers none. */
function Colours({
  name,
  hint,
  value,
  mode,
  clear,
  data,
  onPick,
}: {
  name: string;
  hint?: string;
  value: ThemeColor | null;
  mode: ThemeMode;
  clear?: string;
  data: string;
  onPick: (color: ThemeColor | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-col gap-0.5">
        <span className="text-ink text-sm font-medium">{name}</span>
        {hint ? <span className="text-pool-500 text-xs">{hint}</span> : null}
      </span>
      <div
        role="radiogroup"
        aria-label={name}
        data-theme-colors={data}
        className="grid grid-cols-6 gap-3"
      >
        {THEMES.map((t) => {
          const on = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t.name}
              data-theme-swatch={t.key}
              onClick={() => onPick(t.key)}
              className={`h-9 w-9 justify-self-center rounded-full ${on ? 'ring-ink ring-2 ring-offset-2' : ''}`}
              // In pastel mode each swatch shows its pastel (0036).
              style={{ backgroundColor: mode === 'pastel' ? t.pastel.fill : t.hex }}
            />
          );
        })}
      </div>
      {clear ? (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          data-theme-clear={data}
          onClick={() => onPick(null)}
          className={`self-start rounded-full px-3 py-1.5 text-xs font-medium ${
            value === null ? 'bg-ink text-white' : 'border-pool-200 text-pool-500 border'
          }`}
        >
          {clear}
        </button>
      ) : null}
    </div>
  );
}
