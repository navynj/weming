/**
 * The tab's icon: the app mark — three white wave lines on a solid ground —
 * in the colour the place wears (lib/theme.ts), so the tab says which
 * theme, Home's or a pool's, the page is in. The same grammar as
 * scripts/make-icons.py, drawn heavier: at 16px the home-screen icon's
 * hairlines vanish.
 */
export function faviconSvg(hex: string): string {
  // One line: four half-waves across the middle, quadratic arcs smoothed
  // by T, so it reads as a sine without one being computed.
  const line = (y: number): string => `<path d="M14 ${y}q9 -9 18 0t18 0t18 0t18 0" />`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" rx="24" fill="${hex}"/>` +
    `<g fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round">` +
    `${line(30)}${line(52)}${line(74)}` +
    `</g></svg>`
  );
}

/** As an `href`: a data URI, so no request, no route and no cache to go stale. */
export function faviconHref(hex: string): string {
  return `data:image/svg+xml,${encodeURIComponent(faviconSvg(hex))}`;
}
