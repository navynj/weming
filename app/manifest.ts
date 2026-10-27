import type { MetadataRoute } from 'next';

/**
 * Enough of a manifest to install, and nothing more.
 *
 * No offline cache: a diary that shows a stale day is worse than one that
 * says it cannot reach the network, and getting that right is its own piece
 * of work rather than a line here. The one service worker (public/sw.js,
 * H32) is for Web Push and has no fetch handler.
 *
 * `standalone` is the whole point — the phone's browser chrome is what makes
 * a bookmarked web page feel like a bookmarked web page.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Weming',
    short_name: 'Weming',
    description: 'A one-line diary that assembles itself.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    // The page's own ground, not the live surface. Law 5 reserves a solid
    // #0507C9 surface for a live session; a status bar carrying it would make
    // that claim for as long as the app is open.
    theme_color: '#ffffff',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Cropped to a circle by the launcher; the mark sits inside the safe
      // zone and the blue takes whatever is trimmed.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
