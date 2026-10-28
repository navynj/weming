'use client';

import type { CSSProperties, ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

import type { Card } from '@/features/home/grid';

import type { BoardLayoutJson, LayoutSource } from './board-layout';
import { LABEL_STYLES, type Recipe } from './layout';
import { ChosenDot, useLabelStyleNames } from './label-styles';
import { PartOrder } from './part-order';
import { LAYER_RANGE } from './stacking';
import { useSignedPhotos } from './use-board-photos';

export type Edit = (patch: BoardLayoutJson, clear?: string[]) => void;

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
  disabled = false,
  note,
}: {
  name: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  /** Why it cannot be switched, beside it. */
  note?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-layout-switch={name}
      disabled={disabled}
      title={note}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 text-xs text-white/80 disabled:opacity-50"
    >
      <span
        className={`flex h-4 w-7 items-center rounded-full p-0.5 ${on ? 'justify-end bg-white' : 'justify-start bg-white/25'}`}
      >
        <span className={`h-3 w-3 rounded-full ${on ? 'bg-main-900' : 'bg-white'}`} />
      </span>
      {name}
      {note ? <span className="text-white/60">· {note}</span> : null}
    </button>
  );
}

/**
 * A few named choices for one field (review: the label's style), each with
 * its own look always; the set one has the toolbar's dot under it, never a
 * fill. Auto hands the field back to the recipe.
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
  // One border width on all, so Auto's dashed one does not make it taller.
  const chip = (auto: boolean) =>
    `relative rounded-full border bg-white/15 px-2.5 py-0.5 text-white/80 ${
      auto ? 'border-dashed border-white/50' : 'border-transparent'
    }`;
  return (
    <div
      data-layout-control={name}
      role="group"
      aria-label={name}
      className="flex items-center gap-2 text-xs"
    >
      <span className="w-20 shrink-0 text-white/80">{name}</span>
      {/* Room under each row for the dot. */}
      <div className="flex flex-wrap gap-x-1 gap-y-3 pb-2">
        <button
          type="button"
          aria-pressed={value === undefined}
          onClick={onReset}
          className={chip(true)}
        >
          Auto
          <ChosenDot on={value === undefined} />
        </button>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            data-layout-choice={option.value}
            onClick={() => onChange(option.value)}
            className={chip(false)}
          >
            {option.label}
            <ChosenDot on={value === option.value} />
          </button>
        ))}
      </div>
    </div>
  );
}

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
/** What the controls edit: the top card's splash, its layout as drawn, and whose it is. */
export type LayoutControlsProps = {
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
};

/**
 * Every hand-set field of a splash's layout as a slider, switch or choice
 * (review): its icon, its label, each photo, every one with its own
 * reset, and Reset all back to the recipe. The desktop panel and the
 * phone's More sheet both hold these, and the board's handles write the
 * same values, so each follows the other as it moves.
 */
export function LayoutControls({
  card,
  recipe,
  layout,
  source,
  home,
  message,
  onEdit,
  onRevert,
}: LayoutControlsProps) {
  const styleNames = useLabelStyleNames();
  // Every photo, so one hidden from the board (0044) can be shown again.
  const photos = card.photos ?? [];
  const signed = useSignedPhotos(photos);
  const piece = layout.piece ?? {};
  const icon = layout.icon ?? {};
  const label = layout.label ?? {};
  // As drawn (review): the recipe's sticker reads off, not on, while Inline is unset.
  const inline = icon.inline ?? recipe !== 'B';
  const pooled = home && card.joint === true && card.poolLayout !== undefined;
  const period = card.splash.range != null && card.splash.range.start < card.splash.range.end;
  // Shown on the board (0055): at least one of photos, icon or label stays.
  const shownCount =
    photos.filter((p) => layout.photos?.[p.path]?.hidden !== true).length +
    (icon.hidden === true ? 0 : 1) +
    (label.hidden === true ? 0 : 1);
  const lastOne = shownCount <= 1;
  const KEEP = 'Keep at least one';

  return (
    <>
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

      {/* The whole piece moved, and set over or under others (0038). */}
      {!period ? (
        <Group title="Position">
          <Slider
            name="X"
            value={piece.x}
            fallback={0}
            min={-3}
            max={3}
            step={0.01}
            unit={lanes}
            onChange={(v) => onEdit({ piece: { x: v } })}
            onReset={() => onEdit({}, ['piece.x'])}
          />
          <Slider
            name="Y"
            value={piece.y}
            fallback={0}
            min={-20}
            max={20}
            step={0.1}
            unit={lines}
            onChange={(v) => onEdit({ piece: { y: v } })}
            onReset={() => onEdit({}, ['piece.y'])}
          />
          {/* Said as a layer, the way design tools say it: higher sits on top. */}
          <Slider
            name="Layer"
            value={piece.layer}
            fallback={0}
            min={LAYER_RANGE[0]}
            max={LAYER_RANGE[1]}
            step={1}
            // The toolbar's layer buttons write it too, and it follows them (0051).
            unit={(v) => (v === 0 ? 'Base' : v > 0 ? `On top +${v}` : `Under −${-v}`)}
            onChange={(v) => onEdit({ piece: { layer: Math.round(v) } })}
            onReset={() => onEdit({}, ['piece.layer'])}
          />
        </Group>
      ) : null}

      {/* A period is a tape along its days (review): only its words' size is its own. */}
      {!period ? (
        <Group title="Icon">
          {/* Off the board only, as a photo can be; the card and the page keep it (0055). */}
          <Switch
            name="Show icon on board"
            on={icon.hidden !== true}
            disabled={lastOne && icon.hidden !== true}
            note={lastOne && icon.hidden !== true ? KEEP : undefined}
            onChange={(on) =>
              on ? onEdit({}, ['icon.hidden']) : onEdit({ icon: { hidden: true } })
            }
          />
          {/* A photo's caption keeps its icon inline: there is no sticker to switch to. */}
          {recipe !== 'C' ? (
            <Switch name="Inline" on={inline} onChange={(on) => onEdit({ icon: { inline: on } })} />
          ) : null}
          {!inline ? (
            <>
              <Slider
                name="Size"
                value={icon.size}
                fallback={2}
                min={0.5}
                max={8}
                step={0.1}
                unit={(v) => `${v.toFixed(1)}×`}
                onChange={(v) => onEdit({ icon: { size: v } })}
                onReset={() => onEdit({}, ['icon.size'])}
              />
              <Slider
                name="Icon X"
                value={icon.x}
                fallback={0}
                min={-3}
                max={3}
                step={0.01}
                unit={lanes}
                onChange={(v) => onEdit({ icon: { x: v } })}
                onReset={() => onEdit({}, ['icon.x'])}
              />
              <Slider
                name="Icon Y"
                value={icon.y}
                fallback={0}
                min={-20}
                max={20}
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
            min={-45}
            max={45}
            step={1}
            unit={degrees}
            onChange={(v) => onEdit({ icon: { tilt: v } })}
            onReset={() => onEdit({}, ['icon.tilt'])}
          />
        </Group>
      ) : null}

      <Group title="Label">
        {!period ? (
          <Switch
            name="Show label on board"
            on={label.hidden !== true}
            disabled={lastOne && label.hidden !== true}
            note={lastOne && label.hidden !== true ? KEEP : undefined}
            onChange={(on) =>
              on ? onEdit({}, ['label.hidden']) : onEdit({ label: { hidden: true } })
            }
          />
        ) : null}
        {!period ? (
          <>
            {/* Any record's to choose (0058), joint or not; Auto is the rule's.
                The toolbar's swatch says the same four. */}
            <Choice
              name="Style"
              value={label.style}
              options={LABEL_STYLES.map((value) => ({ value, label: styleNames[value] }))}
              onChange={(v) => onEdit({ label: { style: v } })}
              onReset={() => onEdit({}, ['label.style'])}
            />
            <Slider
              name="Width"
              value={label.width}
              fallback={1}
              min={0.3}
              max={4}
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
              min={-3}
              max={3}
              step={0.01}
              unit={lanes}
              onChange={(v) => onEdit({ label: { x: v } })}
              onReset={() => onEdit({}, ['label.x'])}
            />
            <Slider
              name="Label Y"
              value={label.y}
              fallback={0}
              min={-20}
              max={20}
              step={0.1}
              unit={lines}
              onChange={(v) => onEdit({ label: { y: v } })}
              onReset={() => onEdit({}, ['label.y'])}
            />
            <Slider
              name="Label tilt"
              value={label.tilt}
              fallback={0}
              min={-45}
              max={45}
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
            const field = (f: 'size' | 'x' | 'y' | 'tilt' | 'hidden') =>
              `photos.${photo.path}.${f}`;
            const shown = set.hidden !== true;
            return (
              <div key={photo.path} data-layout-photo={photo.path} className="flex gap-2">
                {signed[photo.path] ? (
                  // A signed URL for a few minutes: next/image would cache it past its life.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signed[photo.path]!}
                    alt={`Photo ${at + 1}`}
                    className="h-10 w-10 shrink-0 object-contain"
                  />
                ) : (
                  <span aria-hidden className="h-10 w-10 shrink-0 bg-white/20" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* Off the board only; the card and the sheet keep it (0044). */}
                  <Switch
                    name="Show on board"
                    on={shown}
                    disabled={lastOne && shown}
                    note={lastOne && shown ? KEEP : undefined}
                    onChange={(on) =>
                      on
                        ? onEdit({}, [field('hidden')])
                        : onEdit({ photos: { [photo.path]: { hidden: true } } })
                    }
                  />
                  <Slider
                    name={`Photo ${at + 1} size`}
                    value={set.size}
                    fallback={0.6}
                    min={0.2}
                    max={2}
                    step={0.01}
                    unit={lanes}
                    onChange={(v) => onEdit({ photos: { [photo.path]: { size: v } } })}
                    onReset={() => onEdit({}, [field('size')])}
                  />
                  <Slider
                    name={`Photo ${at + 1} X`}
                    value={set.x}
                    fallback={0}
                    min={-3}
                    max={3}
                    step={0.01}
                    unit={lanes}
                    onChange={(v) => onEdit({ photos: { [photo.path]: { x: v } } })}
                    onReset={() => onEdit({}, [field('x')])}
                  />
                  <Slider
                    name={`Photo ${at + 1} Y`}
                    value={set.y}
                    fallback={0}
                    min={-20}
                    max={20}
                    step={0.1}
                    unit={lines}
                    onChange={(v) => onEdit({ photos: { [photo.path]: { y: v } } })}
                    onReset={() => onEdit({}, [field('y')])}
                  />
                  <Slider
                    name={`Photo ${at + 1} tilt`}
                    value={set.tilt}
                    fallback={0}
                    min={-45}
                    max={45}
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
        <PartOrder
          layout={layout}
          photos={photos.map((p) => p.path)}
          sticker={!inline && recipe !== 'C'}
          onEdit={(patch) => onEdit(patch)}
        />
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
          onClick={() => onEdit({}, ['icon', 'label', 'photos'])}
          className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium"
        >
          Reset all
        </button>
      </div>
    </>
  );
}
