'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { DEFAULT_THEME, THEMES, type ThemeColor, type ThemeMode } from '@/lib/theme';

import { useToast } from '@/components/ui/toast';
import { Switch } from '@/features/pool/switch';

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
 * everything for me, behind "Use my color" (H43): off, the pool's colour
 * (or the usual fallback) and the swatches muted with none chosen; a
 * swatch turns it on; on with none chosen, my Home colour; off clears mine
 * here. A colour and its mode are one choice (0062): in a pool the mode —
 * Dark, Light or Pastel, with no label — sits under my colour here and is
 * mine here (a tap turns my colour here on, with the colour worn now), and
 * the pool's default, unfolded, has a mode of its own (none chosen: each
 * member's own). On Home it is my Home mode, at the bottom.
 * Every choice shows at once and saves behind it (CLAUDE.md, the
 * principle); a refusal takes it back and says why. Chosen wears ink
 * (H20f). Every colour keeps 3:1 against its ground (tests/theme.test.tsx).
 */
export function ThemePicker() {
  const { mine, place, theme, chooseHome, chooseMode, choosePoolColor, chooseMyPoolColor } =
    useTheme();
  // The mode a colour here is chosen with: mine here when I use my colour,
  // else the one worn now.
  const hereMode = place?.colors.mine ? (place.colors.mineMode ?? mine.mode) : theme.mode;
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
            muted={place.colors.mine === null}
            mode={theme.mode}
            data="mine"
            onPick={(color) => void done(chooseMyPoolColor(color, hereMode))}
            trailing={
              <span data-theme-use-mine>
                <Switch
                  on={place.colors.mine !== null}
                  label="Use my color"
                  onChange={(on) =>
                    void done(
                      chooseMyPoolColor(on ? (mine.home ?? DEFAULT_THEME.color) : null, hereMode),
                    )
                  }
                />
              </span>
            }
          />
          {/* Its mode, the same choice as the colour above (0062). */}
          <Modes
            value={place.colors.mine ? hereMode : null}
            muted={place.colors.mine === null}
            data="mine"
            onPick={(mode) => void done(chooseMyPoolColor(place.colors.mine ?? theme.color, mode))}
          />
          {/* The pool's own default (review): a row that folds it, closed each
              time the sheet opens; its colour shows before the chevron when set. */}
          <div data-theme-pool className="flex flex-col gap-3">
            <button
              type="button"
              data-theme-pool-open
              aria-expanded={poolOpen}
              onClick={() => setPoolOpen((open) => !open)}
              className="text-main-900 flex w-full items-center gap-2 text-left text-sm font-semibold"
            >
              <span className="min-w-0 flex-1">Set default color for this Pool</span>
              {place.colors.pool ? (
                <span
                  aria-label={THEMES.find((t) => t.key === place.colors.pool)?.name}
                  data-theme-pool-swatch={place.colors.pool}
                  className="h-5 w-5 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      (place.colors.poolMode ?? theme.mode) === 'pastel'
                        ? THEMES.find((t) => t.key === place.colors.pool)?.pastel.fill
                        : THEMES.find((t) => t.key === place.colors.pool)?.hex,
                  }}
                />
              ) : null}
              {poolOpen ? (
                <ChevronUp aria-hidden size={18} className="text-pool-500 shrink-0" />
              ) : (
                <ChevronDown aria-hidden size={18} className="text-pool-500 shrink-0" />
              )}
            </button>
            {poolOpen ? (
              <>
                <Colours
                  name="Pool default color"
                  hint="Everyone here sees it, unless they choose their own."
                  value={place.colors.pool}
                  mode={place.colors.poolMode ?? theme.mode}
                  clear="None"
                  data="pool"
                  onPick={(color) =>
                    void done(choosePoolColor(color, place.colors.poolMode ?? null))
                  }
                />
                {/* The default's own mode (0062); with no colour, nothing to wear it with. */}
                <Modes
                  value={place.colors.pool ? (place.colors.poolMode ?? null) : null}
                  muted={place.colors.pool === null}
                  disabled={place.colors.pool === null}
                  data="pool"
                  onPick={(mode) => void done(choosePoolColor(place.colors.pool, mode))}
                />
              </>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <Colours
            name="My color"
            heading={false}
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

      {/* My Home mode, on Home; in a pool each colour carries its own above. */}
      {place ? null : (
        <Modes value={mine.mode} data="home" onPick={(mode) => void done(chooseMode(mode))} />
      )}
      {message ? (
        <p role="alert" className="text-ink text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Dark · Light · Pastel, the chosen one in ink (H20f), no label. `value`
 * null: none chosen (in a pool, the colour it goes with is not set);
 * `muted` shows it faded, still a tap to choose; `disabled`, not a tap.
 */
function Modes({
  value,
  muted = false,
  disabled = false,
  data,
  onPick,
}: {
  value: ThemeMode | null;
  muted?: boolean;
  disabled?: boolean;
  data: string;
  onPick: (mode: ThemeMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Mode"
      data-theme-modes={data}
      data-muted={muted ? '' : undefined}
      className={`bg-pool-100 flex w-full rounded-full p-1 text-sm font-medium ${muted ? 'opacity-40' : ''}`}
    >
      {MODES.map(({ mode, label }) => {
        const on = mode === value;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            data-theme-mode={mode}
            onClick={() => onPick(mode)}
            className={`flex-1 rounded-full py-1.5 ${on ? 'bg-ink text-white' : 'text-pool-500'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Twelve colours as swatches, the chosen one ringed in ink; `clear` offers
 * none, as the grid's last swatch: white, outlined, struck through in red. `heading` false: the swatches stand alone, `name` their label only.
 * `muted`: shown faded, none chosen, still a tap to choose; `trailing` sits
 * at the heading's far right.
 */
function Colours({
  name,
  heading = true,
  hint,
  value,
  muted = false,
  mode,
  clear,
  data,
  onPick,
  trailing,
}: {
  name: string;
  heading?: boolean;
  hint?: string;
  value: ThemeColor | null;
  muted?: boolean;
  mode: ThemeMode;
  clear?: string;
  data: string;
  onPick: (color: ThemeColor | null) => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {heading ? (
        <span className="flex items-start gap-3">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-ink text-sm font-medium">{name}</span>
            {hint ? <span className="text-pool-500 text-xs">{hint}</span> : null}
          </span>
          {trailing}
        </span>
      ) : null}
      <div
        role="radiogroup"
        aria-label={name}
        data-theme-colors={data}
        data-muted={muted ? '' : undefined}
        className={`grid grid-cols-6 gap-3 ${muted ? 'opacity-40' : ''}`}
      >
        {THEMES.map((t) => {
          const on = !muted && t.key === value;
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
        {clear ? (
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            aria-label={clear}
            title={clear}
            data-theme-clear={data}
            onClick={() => onPick(null)}
            className={`border-pool-200 relative h-9 w-9 justify-self-center overflow-hidden rounded-full border ${
              value === null ? 'ring-ink ring-2 ring-offset-2' : ''
            }`}
            // White on any ground, whatever a mode makes of `white` there.
            style={{ backgroundColor: '#ffffff' }}
          >
            {/* No colour: a thin red stroke from corner to corner. */}
            <span
              aria-hidden
              className="absolute top-1/2 left-1/2 h-px w-[130%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-500"
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}
