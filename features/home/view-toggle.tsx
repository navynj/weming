'use client';

export type HomeView = 'lane' | 'date' | 'board';

/** The views in the toggle's order; re-tapping Home walks them (review). */
export const HOME_VIEW_ORDER: readonly HomeView[] = ['board', 'lane', 'date'];

/** The view after this one, in the toggle's order. */
export function nextHomeView(view: HomeView): HomeView {
  return HOME_VIEW_ORDER[(HOME_VIEW_ORDER.indexOf(view) + 1) % HOME_VIEW_ORDER.length];
}

/**
 * The header's segmented toggle, Calendar | Lane | List (round 3; Calendar first): the selected
 * segment white with blue words — on the water white carries what is
 * chosen (H21c) — the other quiet.
 */
export function ViewToggle({
  view,
  onChange,
}: {
  view: HomeView;
  onChange: (view: HomeView) => void;
}) {
  return <SegmentedToggle view={view} onChange={onChange} options={HOME_VIEWS} />;
}

// Calendar | Lane | List (review): the values are the remembered keys and
// the tests' names, the labels what the hand reads.
const HOME_VIEWS = [
  { value: 'board', label: 'Calendar' },
  { value: 'lane', label: 'Lane' },
  { value: 'date', label: 'List' },
] as const;

/** What a view is called, for the foot's label. */
export function homeViewName(view: HomeView): string {
  return HOME_VIEWS.find((v) => v.value === view)?.label ?? view;
}

/** The same toggle with any segments: a pool's Lane | Date | Swimmers (H23). */
export function SegmentedToggle<V extends string>({
  view,
  onChange,
  options,
}: {
  view: V;
  onChange: (view: V) => void;
  options: readonly { value: V; label: string }[];
}) {
  return (
    <div
      role="tablist"
      aria-label="View"
      data-view-toggle
      className="flex w-full rounded-full bg-white/15 p-0.5 text-sm font-medium"
    >
      {options.map((option) => {
        const selected = option.value === view;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            data-view-option={option.value}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-full px-3 py-1.5 ${selected ? 'text-main-900 bg-white' : 'text-white/70'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
