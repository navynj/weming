'use client';

/**
 * Tabs as words (review): muted until chosen, the chosen one in ink with a
 * 2px rule beneath, a hairline under the whole row — the toolbar's part
 * tabs, the settings sheets' and the notification settings'. Selection is
 * ink (H20f), never a fill.
 */
export function UnderlineTabs<K extends string>({
  tabs,
  current,
  onSelect,
  label,
  data,
}: {
  tabs: readonly { key: K; label: string }[];
  current: K;
  onSelect: (key: K) => void;
  label: string;
  /** The attribute each tab carries its key in, for tests and probes. */
  data: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="no-scrollbar border-ink/10 flex min-w-0 items-end gap-1 overflow-x-auto border-b"
    >
      {tabs.map((tab) => {
        const on = tab.key === current;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={on}
            {...{ [`data-${data}`]: tab.key }}
            onClick={() => onSelect(tab.key)}
            className={`relative flex h-10 shrink-0 items-center px-3 text-sm font-semibold ${
              on ? 'text-ink' : 'text-pool-500'
            }`}
          >
            {tab.label}
            {on ? (
              <span aria-hidden className="bg-ink absolute inset-x-2 bottom-0 h-0.5 rounded-full" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
