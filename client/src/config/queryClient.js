import { QueryClient } from '@tanstack/react-query';

/**
 * Shared query client.
 *
 * `staleTime` is deliberately non-zero: the catalogue does not change between
 * one render and the next, and without it every remount refetches, which is
 * what made the old `useEffect` fetching feel slow when moving between pages.
 *
 * A 401 is never retried — the session is gone, and `apiFetch` has already
 * tried to refresh it and redirected. Retrying would just delay that.
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error?.status === 401 || error?.status === 403) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });

export const queryClient = createQueryClient();

export default queryClient;
