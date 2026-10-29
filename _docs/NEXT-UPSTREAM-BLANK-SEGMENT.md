# Draft upstream issue: a segment settled to "missing" is reused from the BFCache, and the page renders nothing

A draft for the Next.js repository (H64), for Yoonji to file. Nothing here has
been sent. Before filing, re-check it against the latest Next release, and
search the existing issues for "BFCache", "staleTimes" and "blank page".

**Status of the reproduction:** reproduced reliably in this app; **not yet in
a standalone app.** Three standalone variants (below), 24 runs of 30s each,
drew a page every time. The issue can be filed with the analysis and the
in-app evidence, or held until a standalone reproduction exists. The second
is likelier to get attention.

---

## Title

App Router: after a superseded navigation, a segment resolved to `null` is reused from the BFCache within `staleTimes.dynamic`, and the page renders nothing until a reload

## Versions

- `next` 16.3.5 (Turbopack production build); the same code is in 16.4.3
  (`render-tree.js`).
- `react` / `react-dom` 19.2.8
- Chrome, desktop and Android; seen in production on phones.

## What happens

Switching quickly between instances of one dynamic route (`/pool/[id]`) leaves
the page area blank: the root layout renders, but everything under the
`[id]` segment is gone. No error is thrown, nothing is logged, and the main
thread stays responsive. Navigating to that URL again within
`staleTimes.dynamic` stays blank: the router does not request anything. Only a
reload recovers.

At the blank, the `InnerLayoutRouter` for `["children", ..., "pool", "children"]`
holds a `cacheNode.rsc` that is a thenable with `status: 'fulfilled'` and
`value: null`, and its `slots.children` holds a cache node for the child
segment. `layout-router.js` (16.3.5, line ~389) reads `null` as "the data
for this segment is missing", and suspends forever on `unresolvedThenable`,
expecting the router to dispatch an update. None comes.

## Why we believe it happens

1. A navigation creates a deferred `rsc` for each segment it must fetch, and
   writes it to the BFCache at once (`writeToBFCache` in
   `ppr-navigations.js`, `createCacheNodeForSegment`).
2. If the response ends without data for that segment,
   `abortRemainingPendingTasks` → `abortPendingCacheNode` resolves the
   deferred to `null` ("this will trigger a lazy fetch during render") and
   returns a soft-retry status. When a newer navigation has superseded this
   one, nothing re-fetches that segment.
3. A later regular navigation to the same URL, within `staleTimes.dynamic`,
   reads the BFCache entry (`readFromBFCacheDuringRegularNavigation`,
   `ppr-navigations.js` ~565) and builds the cache node from it with
   `needsDynamicRequest: false`. **The entry's `rsc` status is never
   checked**, so the `null` is rendered and the segment suspends forever.
4. A second path copies a BFCache entry into the prefetch segment cache as
   fulfilled, complete data for five minutes: a full prefetch
   (`router.prefetch(href, { kind: 'full' })`) calls
   `attemptToFulfillDynamicSegmentFromBFCache` /
   `attemptToUpgradeSegmentFromBFCache` (`segment-cache/cache.js` ~774,
   ~803). If the copied `rsc` is a deferred still pending, it is copied as it
   stands, and when it later settles to `null` the segment cache serves it
   to every navigation to that URL with no request.

In the app, a full prefetch on `pointerdown` of a link, followed by its
click, raced the click's own navigation; tapping on to the next link cut that
navigation off. Removing the press-time prefetch removed most of the blanks;
the rest went away with the change below.

## Evidence (in-app)

A Playwright test on a production build taps four links of `/pool/[id]` as
fast as it can for 30s:

| | CPU ×1 | CPU ×4 |
|---|---|---|
| Unchanged | blank in 2 of 5 runs | blank in 2 of 5; 4 of 4 with four runs in parallel |
| With the change below and no press-time prefetch | 4 of 4 drew a page | 4 of 4 drew a page |

With the change below, its counter showed 1–3 segments per run that the
router would have reused without data.

## What we changed (a workaround, as a pnpm patch)

In `segment-cache/bfcache.js`, both readers treat an entry whose `rsc` settled
without data as a miss:

```js
function withData(entry) {
  if (entry === null) return null;
  const rsc = entry.rsc;
  if (
    rsc !== null &&
    typeof rsc === 'object' &&
    (rsc.status === 'rejected' || (rsc.status === 'fulfilled' && rsc.value === null))
  ) {
    return null;
  }
  return entry;
}
// readFromBFCache and readFromBFCacheDuringRegularNavigation return withData(...)
```

Treating a **pending** `rsc` as a miss as well was tried and rejected: it
re-fetched on nearly every tap during fast switching (over a thousand
refetches in 30s in one run). The copy of a pending deferred into the
segment cache (point 4) stays unhandled. A fix upstream likely belongs where
the deferred settles to `null`: evict or invalidate its BFCache entry and any
segment-cache entry fulfilled from it.

## Expected

A segment whose data was not delivered is fetched again on the next
navigation to it (or the soft retry is kept even when superseded), never
rendered from a cached `null`.

## Standalone reproduction attempted (does not reproduce yet)

`next.config.mjs`:

```js
export default { experimental: { staleTimes: { dynamic: 300 } } };
```

`app/layout.jsx` (with `app/@modal/default.jsx` returning `null`):

```jsx
export default function RootLayout({ children, modal }) {
  return (
    <html lang="en">
      <body>
        <main id="slot">{children}</main>
        {modal}
      </body>
    </html>
  );
}
```

`app/p/[id]/(board)/page.jsx`, with a `loading.jsx` beside it:

```jsx
import { connection } from 'next/server';
import { FreshOnArrival } from '../../../fresh-on-arrival';
import { Heavy, Nav } from '../../../nav';

export default async function Page({ params }) {
  await connection();
  const { id } = await params;
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 300));
  return (
    <>
      <Nav here={id} />
      <h1 data-page={id}>Page {id}</h1>
      <Heavy />
      <FreshOnArrival renderedAt={Date.now()} />
    </>
  );
}
```

`app/nav.jsx` (client): four `<Link prefetch={false}>`s to `/p/1`…`/p/4`,
each with `onPointerDown={() => router.prefetch(href, { kind: 'full' })}`; on
mount it prefetches two other pages in full, at most once in 30s each,
re-prefetching from `onInvalidate`. `Heavy` busy-loops 40ms in render.
`FreshOnArrival` (client) calls `router.refresh()` in a transition when the
page it arrives on was rendered more than 5s ago.

The driver: four Chrome pages in parallel (390×844, touch, CPU ×4) tap the
four links in turn as fast as Playwright allows for 30s, then wait 10s for
`#slot [data-page]`. Variants tried: the nav in the layout; plus `loading.jsx`
in a route group, an `@modal` slot and `FreshOnArrival`; plus the nav in the
page, warming and `Heavy`. No blank in 24 runs.

Still different in the app, so candidates for a reproduction: a proxy
(middleware) on every request that refreshes an auth cookie; the page's data
read from a database at real latency; `@modal` intercepting routes
(`(.)pool/[id]/splash/[sid]`), so responses vary with `Next-Url`; Sentry's
`onRouterTransitionStart`.
