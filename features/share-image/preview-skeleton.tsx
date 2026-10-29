import type { ShareSpan } from './range';

/**
 * The preview while the image is drawn (H63): the page's own outline — its
 * title, then the week's two rows or the month's weeks — breathing softly.
 * Chrome, not the record, so it may move; still under reduced motion.
 */
export function PreviewSkeleton({ span }: { span: ShareSpan }) {
  const rows = span === 'week' ? [4, 4] : [7, 7, 7, 7, 7];
  return (
    <div
      role="status"
      aria-label="Drawing the image"
      data-share-skeleton={span}
      className="flex h-full w-full flex-col gap-2 p-3 motion-safe:animate-pulse"
    >
      <div className="bg-pool-200 h-3 w-1/2 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        {rows.map((cells, row) => (
          <div key={row} className="flex flex-1 gap-1.5">
            {Array.from({ length: cells }, (_, cell) => (
              <div key={cell} className="bg-pool-200 flex-1 rounded-md" />
            ))}
          </div>
        ))}
      </div>
      {span === 'month' ? <div className="bg-pool-200 h-2 w-1/3 self-end rounded-full" /> : null}
    </div>
  );
}
