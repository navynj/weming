import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';

import { Providers } from '@/app/providers';
import { getMyTheme } from '@/lib/queries/theme';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_THEME, resolveTheme, type MyTheme } from '@/lib/theme';
import './globals.css';

// Poppins is not a variable font, so every weight is listed explicitly;
// anything not here would be synthesised by the browser rather than fail
// visibly. 700 stays declared for the rare real bold — an unused @font-face
// is never downloaded, so keeping it available costs nothing.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

// The intro's two lines, bold one first (H65); a link preview reads the same.
const description =
  "Pool your days with a few close friends. We're swimming side by side, each in our own lane.";

export const metadata: Metadata = {
  title: 'Weming',
  description,
  openGraph: { title: 'Weming', description },
  twitter: { card: 'summary', title: 'Weming', description },
  // Installed on a phone it is an app, so it gets an app's name and an
  // app's status bar rather than a browser's.
  appleWebApp: { capable: true, title: 'Weming', statusBarStyle: 'default' },
  icons: { apple: '/apple-touch-icon.png' },
  // Next emits only the modern `mobile-web-app-capable`. iOS before 16.4 reads
  // the Apple-prefixed name and nothing else, and 16.4+ ignores it in favour
  // of the manifest — so carrying both costs one tag and covers both.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

/**
 * `viewportFit: 'cover'` is load-bearing, not polish: the tab bar, the bottom
 * sheets and the Lanes strip all pad themselves with `env(safe-area-inset-*)`,
 * and those resolve to 0 under the default viewport. Without this the bar sits
 * under the home indicator on a notched phone and every sheet's last control
 * is half unreachable.
 *
 * No zoom on a phone (review, 2026-10-23): the app is a PWA and should hold
 * still like one. A pinch or a double tap must not knock the grid, the stack
 * or a sheet out of frame, and tapping a field must not zoom into it. The meta
 * stops Android and the iOS focus zoom; iOS ignores `user-scalable=no` for a
 * pinch, so `touch-action` in globals.css stops that. Desktop ignores both.
 *
 * The status bar is white, not #0507C9. Law 5 gives a solid #0507C9 *content*
 * surface one meaning — a live session — and the status bar is always there,
 * so tinting it would claim the app is running something whenever it is open.
 * It is also the app's own ground, which is what makes the bar disappear into
 * the page instead of sitting on top of it as a band.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

/** My theme (0059), worn from the first paint as Home's; a pool wears its own on arrival. */
async function myTheme(): Promise<MyTheme> {
  return getMyTheme(await createClient()).catch(() => ({
    home: DEFAULT_THEME.color,
    mode: DEFAULT_THEME.mode,
    everywhere: false,
  }));
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const mine = await myTheme();
  const theme = resolveTheme(mine, null);
  return (
    <html
      lang="en"
      data-theme={theme.color}
      data-mode={theme.mode}
      // A pool's page re-wears both before hydrating (lib/theme.ts, wornHere).
      suppressHydrationWarning
      className={`${poppins.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers theme={mine}>{children}</Providers>
      </body>
    </html>
  );
}
