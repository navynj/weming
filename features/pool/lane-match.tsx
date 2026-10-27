'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { EmojiInput } from '@/features/lanes/emoji-input';
import type { MyCategory } from '@/lib/queries/profile';

import { settleMarkers, siblings, type Links, type Markers, type MatchLane } from './match';

/**
 * Pool settings → Advanced → Connect your lanes (0033): one row per pool
 * lane, and a dropdown of my lanes. A connected row can carry two defaults:
 * **Show on Home in <my lane>** (its home lane: this pool lane's pool and
 * joint records sit in that column on Home), and, on the row that is my
 * lane's default here, **Share new <my lane> records** (Audience starts on
 * this pool lane). A lane of mine connected on several rows picks which one
 * is its default. Never part of joining or composing; unlinking moves no
 * record.
 */
export function LaneMatch({
  poolName,
  lanes,
  categories,
  links,
  onLinksChange,
  markers,
  onMarkersChange,
  onCreateLane,
  footer,
  action,
}: {
  poolName: string;
  lanes: MatchLane[];
  categories: Pick<MyCategory, 'id' | 'name' | 'icon'>[];
  links: Links;
  onLinksChange: (links: Links) => void;
  markers: Markers;
  onMarkersChange: (markers: Markers) => void;
  /** Makes one of my lanes and returns its id, or a refusal. */
  onCreateLane: (lane: { name: string; icon: string }) => Promise<string | { message: string }>;
  footer?: ReactNode;
  action: ReactNode;
}) {
  const [making, setMaking] = useState(false);
  const keys = lanes.map((lane) => lane.key);
  // What is shown is what is saved: the settings save settles the same way.
  const settled = settleMarkers(keys, links, markers);
  const mineName = (id: string | null): string =>
    categories.find((c) => c.id === id)?.name ?? 'your lane';
  const unconnected = lanes.filter((lane) => !links[lane.key]);
  const mark = (key: string, patch: Partial<Markers[string]>): void => {
    const next: Markers = { ...settled, [key]: { ...settled[key], ...patch } };
    if (patch.isDefault) {
      // One default per lane of mine: the others let go, and the new one
      // carries the old one's sharing.
      const rows = siblings(key, keys, links);
      const carried = rows.some((o) => settled[o]?.isDefault && settled[o]?.shareByDefault);
      for (const other of rows) {
        if (other !== key)
          next[other] = { ...next[other], isDefault: false, shareByDefault: false };
      }
      next[key] = { ...next[key], isDefault: true, shareByDefault: carried };
    }
    onMarkersChange(next);
  };

  return (
    <div data-lane-match className="flex min-h-0 flex-1 flex-col">
      <h2 className="text-ink font-semibold">Connect your lanes</h2>
      <p className="text-pool-500 mt-2 text-sm/relaxed">
        Lanes are your own columns on Home. Connecting one to this pool can preselect sharing and
        show this pool&apos;s records in it.
      </p>

      <div className="text-pool-500 mt-6 flex justify-between text-xs">
        <span data-pool-lanes-label className="truncate">
          {poolName.trim() || 'Pool'} lanes
        </span>
        <span>Your lanes</span>
      </div>

      <ol className="mt-3 flex flex-col gap-3">
        {lanes.map((lane) => {
          const chosen = links[lane.key] ?? null;
          const off = chosen === null;
          const marks = settled[lane.key];
          const several = siblings(lane.key, keys, links).length > 1;
          return (
            <li
              key={lane.key}
              data-match-row={lane.key}
              data-connected={off ? undefined : ''}
              className={`grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-3 rounded-2xl px-5 py-4 ${
                off ? 'bg-pool-100/60' : 'bg-pool-100'
              }`}
            >
              <span className={`flex min-w-0 flex-col gap-1 ${off ? 'opacity-40' : ''}`}>
                <span className="text-main-900 flex min-w-0 items-center gap-1.5 font-semibold">
                  {lane.icon ? <span aria-hidden>{lane.icon}</span> : null}
                  <span className="truncate">{lane.name}</span>
                </span>
                {lane.description ? (
                  <span className="text-pool-500 truncate text-xs">{lane.description}</span>
                ) : null}
              </span>
              <label className="relative flex min-w-0">
                <span className="sr-only">Your lane for {lane.name}</span>
                <select
                  value={chosen ?? ''}
                  data-match-select={lane.key}
                  onChange={(event) =>
                    onLinksChange({ ...links, [lane.key]: event.target.value || null })
                  }
                  className={`h-12 w-full min-w-0 appearance-none truncate rounded-xl bg-white pr-7 pl-3 text-center text-sm font-semibold outline-none ${
                    off
                      ? 'border-pool-200 text-pool-500/60 border'
                      : 'border-main-900 text-main-900 border-2'
                  }`}
                >
                  <option value="">Don&apos;t connect</option>
                  {categories.map((mine) => (
                    <option key={mine.id} value={mine.id}>
                      {mine.icon ? `${mine.icon} ` : ''}
                      {mine.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden
                  size={14}
                  className={`pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 ${
                    off ? 'text-pool-500/40' : 'text-main-900'
                  }`}
                />
              </label>
              {off || !marks ? null : (
                <div className="col-span-2 flex flex-col gap-2 pt-1">
                  <Marker
                    label={`Show on Home in ${mineName(chosen)}`}
                    data="home"
                    lane={lane.key}
                    on={marks.isHome}
                    onChange={(on) => mark(lane.key, { isHome: on })}
                  />
                  {several ? (
                    <Marker
                      label={`Default for ${mineName(chosen)}`}
                      data="default"
                      lane={lane.key}
                      on={marks.isDefault}
                      onChange={(on) => on && mark(lane.key, { isDefault: true })}
                    />
                  ) : null}
                  {marks.isDefault ? (
                    <Marker
                      label={`Share new ${mineName(chosen)} records`}
                      data="share"
                      lane={lane.key}
                      on={marks.shareByDefault}
                      onChange={(on) => mark(lane.key, { shareByDefault: on })}
                    />
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {making ? (
        <MakeLane
          lanes={unconnected.length > 0 ? unconnected : lanes}
          onCancel={() => setMaking(false)}
          onMake={async (key, lane) => {
            const made = await onCreateLane(lane);
            if (typeof made !== 'string') return made.message;
            onLinksChange({ ...links, [key]: made });
            setMaking(false);
            return null;
          }}
        />
      ) : (
        <div className="border-pool-200 mt-3 flex items-center justify-between gap-3 rounded-2xl border px-5 py-4">
          <span className="text-pool-500 text-sm">No lane to match?</span>
          <button
            type="button"
            data-create-and-connect
            onClick={() => setMaking(true)}
            className="text-main-900 text-sm font-semibold"
          >
            + Create and connect
          </button>
        </div>
      )}

      <div className="mt-auto flex flex-col items-center gap-4 pt-10">
        {footer}
        {action}
      </div>
    </div>
  );
}

/** One default on a connected row: a line and a small ink switch (it selects; H20f). */
function Marker({
  label,
  data,
  lane,
  on,
  onChange,
}: {
  label: string;
  data: 'home' | 'default' | 'share';
  lane: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      data-match-marker={data}
      data-match-marker-lane={lane}
      className="text-ink flex items-center justify-between gap-3 text-xs"
    >
      <span className="min-w-0 truncate">{label}</span>
      <Switch on={on} onChange={onChange} label={label} tone="ink" size="sm" />
    </label>
  );
}

/**
 * A switch: blue when on — it commits a choice — pale when off; `tone="ink"`
 * when it selects rather than commits (H20f), as a link's defaults do.
 */
export function Switch({
  on,
  onChange,
  label,
  disabled = false,
  tone = 'blue',
  size = 'md',
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
  tone?: 'blue' | 'ink';
  size?: 'md' | 'sm';
}) {
  const sm = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        sm ? 'h-5 w-9' : 'h-7 w-12'
      } ${on ? (tone === 'ink' ? 'bg-ink' : 'bg-main-900') : 'bg-pool-200'}`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 rounded-full bg-white shadow-sm transition-[left] ${
          sm ? 'h-4 w-4' : 'h-6 w-6'
        } ${on ? (sm ? 'left-[18px]' : 'left-[22px]') : 'left-0.5'}`}
      />
    </button>
  );
}

/** "+ Create and connect": a lane of mine, named after the pool lane by default. */
function MakeLane({
  lanes,
  onCancel,
  onMake,
}: {
  lanes: MatchLane[];
  onCancel: () => void;
  onMake: (key: string, lane: { name: string; icon: string }) => Promise<string | null>;
}) {
  const [key, setKey] = useState(lanes[0]?.key ?? '');
  const target = lanes.find((lane) => lane.key === key) ?? lanes[0];
  const [name, setName] = useState(target?.name ?? '');
  const [icon, setIcon] = useState(target?.icon ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div
      data-make-lane
      className="border-main-900 mt-3 flex flex-col gap-3 rounded-2xl border-2 p-4"
    >
      <label className="flex flex-col gap-1">
        <span className="text-pool-500 text-xs">Connect to</span>
        <select
          value={key}
          onChange={(event) => {
            const next = lanes.find((lane) => lane.key === event.target.value);
            setKey(event.target.value);
            if (next) {
              setName(next.name);
              setIcon(next.icon ?? '');
            }
          }}
          className="border-pool-200 text-ink h-11 rounded-xl border bg-white px-3 text-sm"
        >
          {lanes.map((lane) => (
            <option key={lane.key} value={lane.key}>
              {lane.icon ? `${lane.icon} ` : ''}
              {lane.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <EmojiInput
          value={icon}
          onChange={setIcon}
          label="Your new lane's emoji"
          placeholder="🙂"
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={24}
          aria-label="Your new lane's name"
          placeholder="Lane name"
          className="border-pool-200 text-ink h-12 min-w-0 flex-1 rounded-xl border px-3 outline-none"
        />
      </div>
      {message ? (
        <p role="alert" className="text-pool-500 text-xs">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end gap-4 text-sm">
        <button type="button" onClick={onCancel} className="text-pool-500">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !name.trim() || !icon}
          onClick={async () => {
            setBusy(true);
            setMessage(await onMake(key, { name: name.trim(), icon }));
            setBusy(false);
          }}
          className="text-main-900 font-semibold disabled:opacity-40"
        >
          Create and connect
        </button>
      </div>
    </div>
  );
}
