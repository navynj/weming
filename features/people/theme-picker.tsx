'use client';

import { useState } from 'react';

import { THEMES, type ThemeMode } from '@/lib/theme';

import { useTheme } from './theme-provider';

const MODES: { mode: ThemeMode; label: string }[] = [
  { mode: 'dark', label: 'Dark' },
  { mode: 'light', label: 'Light' },
  { mode: 'pastel', label: 'Pastel' },
];

/**
 * My theme (0032, H26; 0036): twelve colours and a mode — Dark, Light, or
 * Pastel (the colour's pastel as the ground, a soft grey on it). A choice shows at once
 * everywhere and saves behind it (CLAUDE.md, the principle); a refusal takes
 * it back and says why. Dark is the colour as the water with white on it;
 * light is a white ground with the colour on it. What is chosen wears ink,
 * the selection channel (H20f).
 */
export function ThemePicker() {
  const { theme, choose } = useTheme();
  const [message, setMessage] = useState<string | null>(null);

  async function pick(next: typeof theme): Promise<void> {
    setMessage(await choose(next));
  }

  return (
    <section data-theme-picker aria-label="Theme" className="flex w-full flex-col gap-3">
      <span className="text-pool-500 text-xs">Theme</span>
      <div role="radiogroup" aria-label="Colour" className="grid grid-cols-6 gap-3">
        {THEMES.map((t) => {
          const on = t.key === theme.color;
          return (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t.name}
              data-theme-swatch={t.key}
              onClick={() => void pick({ ...theme, color: t.key })}
              className={`h-9 w-9 justify-self-center rounded-full ${on ? 'ring-ink ring-2 ring-offset-2' : ''}`}
              // In pastel mode each swatch shows its pastel (0036).
              style={{ backgroundColor: theme.mode === 'pastel' ? t.pastel.fill : t.hex }}
            />
          );
        })}
      </div>
      <div
        role="radiogroup"
        aria-label="Mode"
        className="bg-pool-100 flex w-full rounded-full p-1 text-sm font-medium"
      >
        {MODES.map(({ mode, label }) => {
          const on = mode === theme.mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={on}
              data-theme-mode={mode}
              onClick={() => void pick({ ...theme, mode })}
              className={`flex-1 rounded-full py-1.5 ${on ? 'bg-ink text-white' : 'text-pool-500'}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {message ? (
        <p role="alert" className="text-ink text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
