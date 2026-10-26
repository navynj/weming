'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';

import type { Card } from '@/features/home/grid';

import type { BoardLayoutJson, LayoutSource } from './board-layout';
import type { Recipe } from './layout';
import { WAVE_DEFAULTS } from './board-pieces';
import { useSignedPhotos } from './use-board-photos';

/** The wave's Size slider scales its height and wavelength together: height 2–8px, wavelength 8–32px. */
const WAVE_SIZE = { min: 1, max: 4, amp: 2, length: 8 } as const;

type Edit = (patch: BoardLayoutJson, clear?: string[]) => void;

/**
 * One slider (review): its name, its value as set (or "Auto"), and a small
 * reset that hands the field back to the automatic recipe.
 */
function Slider({
  name,
  value,
  fallback,
  min,
  max,
  step,
  unit,
  onChange,
  onReset,
}: {
  name: string;
  value: number | undefined;
  /** Where the slider rests while the field is the recipe's. */
  fallback: number;
  min: number;
  max: number;
  step: number;
  /** How a value reads: "0.25 lane", "3°". */
  unit: (v: number) => string;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const set = value !== undefined;
  return (
    <label data-layout-control={name} className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-white/80">{name}</span>
      <input
        type="range"
        aria-label={name}
        min={min}
        max={max}
        step={step}
        value={value ?? fallback}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        style={
          { '--fill': `${(((value ?? fallback) - min) / (max - min)) * 100}%` } as CSSProperties
        }
        className="layout-range min-w-0 flex-1"
      />
      <span
        className={`w-16 shrink-0 text-right tabular-nums ${set ? 'text-white' : 'text-white/50'}`}
      >
        {set ? unit(value) : 'Auto'}
      </span>
      <button
        type="button"
        aria-label={`Reset ${name}`}
        data-layout-reset={name}
        disabled={!set}
        onClick={(event) => {
          event.preventDefault();
          onReset();
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/70 disabled:opacity-20"
      >
        <RotateCcw aria-hidden size={12} />
      </button>
    </label>
  );
}

function Switch({
  name,
  on,
  onChange,
}: {
  name: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-layout-switch={name}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 text-xs text-white/80"
    >
      <span
        className={`flex h-4 w-7 items-center rounded-full p-0.5 ${on ? 'justify-end bg-white' : 'justify-start bg-white/25'}`}
      >
        <span className={`h-3 w-3 rounded-full ${on ? 'bg-main-900' : 'bg-white'}`} />
      </span>
      {name}
    </button>
  );
}

/**
 * A few named choices for one field (review: the label's style), the set
 * one white; Auto hands the field back to the recipe.
 */
function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
  onReset,
}: {
  name: string;
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  onReset: () => void;
}) {
  const chip = (on: boolean) =>
    `rounded-full px-2.5 py-0.5 ${on ? 'text-main-900 bg-white' : 'bg-white/15 text-white/80'}`;
  return (
    <div
      data-layout-control={name}
      role="group"
      aria-label={name}
      className="flex items-center gap-2 text-xs"
    >
      <span className="w-20 shrink-0 text-white/80">{name}</span>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          aria-pressed={value === undefined}
          onClick={onReset}
          className={chip(value === undefined)}
        >
          Auto
        </button>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            data-layout-choice={option.value}
            onClick={() => onChange(option.value)}
            className={chip(value === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const LABEL_STYLE_CHOICES = [
  { value: 'white', label: 'White' },
  { value: 'ink', label: 'Ink' },
] as const;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-layout-group={title} className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-white">{title}</h3>
      {children}
    </section>
  );
}

const lanes = (v: number): string => `${Math.round(v * 100)}%`;
const lines = (v: number): string => `${v.toFixed(1)} ln`;
const degrees = (v: number): string => `${Math.round(v)}°`;

/**
 * The Layout panel (review, desktop only): under the stack's top card,
 * folded to one row until opened; open, the hand-set fields of the top
 * card's splash — its icon, its label, each photo, a wave — every one with
 * its own reset, and Reset all back to the recipe. A slider moves the board
 * at once; the drafts save themselves when it rests. On Home it says whose
 * layout is drawn — the pool's or my Home override — and "Use pool layout"
 * gives a joint splash back to its pool's.
 */
export function LayoutPanel({
  card,
  recipe,
  layout,
  source,
  home,
  message,
  onEdit,
  onRevert,
}: {
  card: Card;
  /** The recipe the board drew it with; null while it is not on the page shown. */
  recipe: Recipe | null;
  layout: BoardLayoutJson;
  source: LayoutSource;
  /** On Home: writes go to my Home layout. */
  home: boolean;
  message: string | null;
  onEdit: Edit;
  onRevert: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const photos = (card.photos ?? []).slice(0, 3);
  const signed = useSignedPhotos(photos);
  const icon = layout.icon ?? {};
  const label = layout.label ?? {};
  const wave = layout.wave ?? {};
  // As drawn (review): the recipe's sticker reads off, not on, while Inline is unset.
  const inline = icon.inline ?? recipe !== 'B';
  const pooled = home && card.joint === true && card.poolLayout !== undefined;
  const period = card.splash.range != null && card.splash.range.start < card.splash.range.end;
  const waveSize =
    wave.amp !== undefined ? wave.amp / WAVE_SIZE.amp : (wave.length ?? 0) / WAVE_SIZE.length || 1;

  return (
    <section
      data-layout-panel={card.splash.id}
      aria-label="Layout"
      className="mt-3 rounded-[24px] bg-white/10 text-white"
    >
      <button
        type="button"
        aria-expanded={open}
        data-layout-toggle
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
      >
        Layout
        <ChevronDown aria-hidden size={16} className={open ? 'rotate-180' : ''} />
      </button>
      {open ? (
        <div
          data-layout-body
          // Scrolls within itself when open, so the stack above keeps its height.
          className="no-scrollbar flex max-h-[45vh] flex-col gap-4 overflow-y-auto px-4 pb-4"
        >
          {home && card.joint ? (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span data-layout-source className="text-white/80">
                {source === 'home' ? 'Home override' : 'Using pool layout'}
              </span>
              {source === 'home' && pooled ? (
                <button
                  type="button"
                  data-layout-use-pool
                  onClick={onRevert}
                  className="rounded-full bg-white/30 px-3 py-1 font-medium text-white"
                >
                  Use pool layout
                </button>
              ) : null}
            </div>
          ) : null}

          {/* A period is a tape along its days (review): only its words' size is its own. */}
          {!period ? (
            <Group title="Icon">
              {/* A photo's caption keeps its icon inline: there is no sticker to switch to. */}
              {recipe !== 'C' ? (
                <Switch
                  name="Inline"
                  on={inline}
                  onChange={(on) => onEdit({ icon: { inline: on } })}
                />
              ) : null}
              {!inline ? (
                <>
                  <Slider
                    name="Size"
                    value={icon.size}
                    fallback={2}
                    min={0.8}
                    max={4}
                    step={0.1}
                    unit={(v) => `${v.toFixed(1)}×`}
                    onChange={(v) => onEdit({ icon: { size: v } })}
                    onReset={() => onEdit({}, ['icon.size'])}
                  />
                  <Slider
                    name="Icon X"
                    value={icon.x}
                    fallback={0}
                    min={-0.6}
                    max={0.6}
                    step={0.01}
                    unit={lanes}
                    onChange={(v) => onEdit({ icon: { x: v } })}
                    onReset={() => onEdit({}, ['icon.x'])}
                  />
                  <Slider
                    name="Icon Y"
                    value={icon.y}
                    fallback={0}
                    min={-6}
                    max={6}
                    step={0.1}
                    unit={lines}
                    onChange={(v) => onEdit({ icon: { y: v } })}
                    onReset={() => onEdit({}, ['icon.y'])}
                  />
                </>
              ) : null}
              {/* Inline or a sticker, it turns. */}
              <Slider
                name="Icon tilt"
                value={icon.tilt}
                fallback={0}
                min={-15}
                max={15}
                step={1}
                unit={degrees}
                onChange={(v) => onEdit({ icon: { tilt: v } })}
                onReset={() => onEdit({}, ['icon.tilt'])}
              />
            </Group>
          ) : null}

          <Group title="Label">
            {!period ? (
              <>
                {/* Only a filled label — a joint splash's — has a fill to choose. */}
                {card.joint ? (
                  <Choice
                    name="Style"
                    value={label.style}
                    options={LABEL_STYLE_CHOICES}
                    onChange={(v) => onEdit({ label: { style: v } })}
                    onReset={() => onEdit({}, ['label.style'])}
                  />
                ) : null}
                <Slider
                  name="Width"
                  value={label.width}
                  fallback={1}
                  min={0.3}
                  max={2}
                  step={0.05}
                  unit={lanes}
                  onChange={(v) => onEdit({ label: { width: v } })}
                  onReset={() => onEdit({}, ['label.width'])}
                />
              </>
            ) : null}
            <Slider
              name="Text size"
              value={label.fontSize}
              fallback={10}
              min={10}
              max={18}
              step={1}
              unit={(v) => `${v}px`}
              onChange={(v) => onEdit({ label: { fontSize: v } })}
              onReset={() => onEdit({}, ['label.fontSize'])}
            />
            {!period ? (
              <>
                <Slider
                  name="Label X"
                  value={label.x}
                  fallback={0}
                  min={-0.6}
                  max={0.6}
                  step={0.01}
                  unit={lanes}
                  onChange={(v) => onEdit({ label: { x: v } })}
                  onReset={() => onEdit({}, ['label.x'])}
                />
                <Slider
                  name="Label Y"
                  value={label.y}
                  fallback={0}
                  min={-6}
                  max={6}
                  step={0.1}
                  unit={lines}
                  onChange={(v) => onEdit({ label: { y: v } })}
                  onReset={() => onEdit({}, ['label.y'])}
                />
                <Slider
                  name="Label tilt"
                  value={label.tilt}
                  fallback={0}
                  min={-15}
                  max={15}
                  step={1}
                  unit={degrees}
                  onChange={(v) => onEdit({ label: { tilt: v } })}
                  onReset={() => onEdit({}, ['label.tilt'])}
                />
              </>
            ) : null}
          </Group>

          {photos.length > 0 && !period ? (
            <Group title="Photos">
              {photos.map((photo, at) => {
                const set = layout.photos?.[photo.path] ?? {};
                const field = (f: 'size' | 'x' | 'y' | 'tilt') => `photos.${photo.path}.${f}`;
                return (
                  <div key={photo.path} data-layout-photo={photo.path} className="flex gap-2">
                    {signed[photo.path] ? (
                      // A signed URL for a few minutes: next/image would cache it past its life.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={signed[photo.path]!}
                        alt={`Photo ${at + 1}`}
                        className="h-10 w-10 shrink-0 object-cover"
                      />
                    ) : (
                      <span aria-hidden className="h-10 w-10 shrink-0 bg-white/20" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <Slider
                        name={`Photo ${at + 1} size`}
                        value={set.size}
                        fallback={0.6}
                        min={0.3}
                        max={1}
                        step={0.01}
                        unit={lanes}
                        onChange={(v) => onEdit({ photos: { [photo.path]: { size: v } } })}
                        onReset={() => onEdit({}, [field('size')])}
                      />
                      <Slider
                        name={`Photo ${at + 1} X`}
                        value={set.x}
                        fallback={0}
                        min={-0.6}
                        max={0.6}
                        step={0.01}
                        unit={lanes}
                        onChange={(v) => onEdit({ photos: { [photo.path]: { x: v } } })}
                        onReset={() => onEdit({}, [field('x')])}
                      />
                      <Slider
                        name={`Photo ${at + 1} Y`}
                        value={set.y}
                        fallback={0}
                        min={-6}
                        max={6}
                        step={0.1}
                        unit={lines}
                        onChange={(v) => onEdit({ photos: { [photo.path]: { y: v } } })}
                        onReset={() => onEdit({}, [field('y')])}
                      />
                      <Slider
                        name={`Photo ${at + 1} tilt`}
                        value={set.tilt}
                        fallback={0}
                        min={-15}
                        max={15}
                        step={1}
                        unit={degrees}
                        onChange={(v) => onEdit({ photos: { [photo.path]: { tilt: v } } })}
                        onReset={() => onEdit({}, [field('tilt')])}
                      />
                    </div>
                  </div>
                );
              })}
            </Group>
          ) : null}

          {!period ? (
            <Group title="Wave">
              <Switch
                name="Wave"
                on={wave.on === true}
                onChange={(on) => (on ? onEdit({ wave: { on: true } }) : onEdit({}, ['wave']))}
              />
              {wave.on ? (
                <>
                  <Slider
                    name="Wave size"
                    value={
                      wave.amp !== undefined || wave.length !== undefined ? waveSize : undefined
                    }
                    fallback={WAVE_DEFAULTS.amp / WAVE_SIZE.amp}
                    min={WAVE_SIZE.min}
                    max={WAVE_SIZE.max}
                    step={0.05}
                    unit={(v) => `${v.toFixed(2)}×`}
                    onChange={(v) =>
                      onEdit({ wave: { amp: v * WAVE_SIZE.amp, length: v * WAVE_SIZE.length } })
                    }
                    onReset={() => onEdit({}, ['wave.amp', 'wave.length'])}
                  />
                  <button
                    type="button"
                    aria-expanded={advanced}
                    onClick={() => setAdvanced(!advanced)}
                    className="self-start text-[10px] text-white/70 underline"
                  >
                    {advanced ? 'Fewer' : 'Height and wavelength'}
                  </button>
                  {advanced ? (
                    <>
                      <Slider
                        name="Wave height"
                        value={wave.amp}
                        fallback={WAVE_DEFAULTS.amp}
                        min={1}
                        max={8}
                        step={0.5}
                        unit={(v) => `${v}px`}
                        onChange={(v) => onEdit({ wave: { amp: v } })}
                        onReset={() => onEdit({}, ['wave.amp'])}
                      />
                      <Slider
                        name="Wavelength"
                        value={wave.length}
                        fallback={WAVE_DEFAULTS.length}
                        min={8}
                        max={32}
                        step={1}
                        unit={(v) => `${v}px`}
                        onChange={(v) => onEdit({ wave: { length: v } })}
                        onReset={() => onEdit({}, ['wave.length'])}
                      />
                    </>
                  ) : null}
                  <Slider
                    name="Weight"
                    value={wave.weight}
                    fallback={WAVE_DEFAULTS.weight}
                    min={1}
                    max={4}
                    step={0.5}
                    unit={(v) => `${v}px`}
                    onChange={(v) => onEdit({ wave: { weight: v } })}
                    onReset={() => onEdit({}, ['wave.weight'])}
                  />
                  <Slider
                    name="Length"
                    value={wave.span}
                    fallback={WAVE_DEFAULTS.span}
                    min={0.2}
                    max={2}
                    step={0.05}
                    unit={lanes}
                    onChange={(v) => onEdit({ wave: { span: v } })}
                    onReset={() => onEdit({}, ['wave.span'])}
                  />
                  <Slider
                    name="Wave X"
                    value={wave.x}
                    fallback={0}
                    min={-0.6}
                    max={0.6}
                    step={0.01}
                    unit={lanes}
                    onChange={(v) => onEdit({ wave: { x: v } })}
                    onReset={() => onEdit({}, ['wave.x'])}
                  />
                  <Slider
                    name="Wave Y"
                    value={wave.y}
                    fallback={0}
                    min={-6}
                    max={6}
                    step={0.1}
                    unit={lines}
                    onChange={(v) => onEdit({ wave: { y: v } })}
                    onReset={() => onEdit({}, ['wave.y'])}
                  />
                  <Slider
                    name="Wave tilt"
                    value={wave.tilt}
                    fallback={0}
                    min={-15}
                    max={15}
                    step={1}
                    unit={degrees}
                    onChange={(v) => onEdit({ wave: { tilt: v } })}
                    onReset={() => onEdit({}, ['wave.tilt'])}
                  />
                </>
              ) : null}
            </Group>
          ) : null}

          <div className="flex items-center justify-between">
            {message ? (
              <p role="alert" className="text-xs text-white/80">
                {message}
              </p>
            ) : (
              <span />
            )}
            <button
              type="button"
              data-layout-reset-all
              onClick={() => onEdit({}, ['icon', 'label', 'photos', 'wave'])}
              className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium"
            >
              Reset all
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
