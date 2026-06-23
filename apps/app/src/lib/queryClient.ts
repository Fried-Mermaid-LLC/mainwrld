import { QueryClient } from '@tanstack/react-query';

// Shared client. Polling intervals are set per-query (chat/notifications use SSE
// + a slow fallback; others are invalidation-driven). refetchOnWindowFocus off —
// Capacitor focus events are noisy.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
