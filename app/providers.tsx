'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ToastProvider } from '@/components/ui/toast';
import { Watchdog } from '@/features/auth/watchdog';
import { ThemeProvider } from '@/features/people/theme-provider';
import type { MyTheme } from '@/lib/theme';

export function Providers({ theme, children }: { theme: MyTheme; children: ReactNode }) {
  // One client per browser session, created inside state so it survives
  // re-renders but is never shared between requests on the server.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initial={theme}>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
      {/* A main thread stuck in a loop, reported from a worker (lib/watchdog.ts). */}
      <Watchdog />
    </QueryClientProvider>
  );
}
