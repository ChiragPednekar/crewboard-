import type { ReactNode } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { toast, Toaster } from 'sonner';

import { TooltipProvider } from '@/components/ui/tooltip';
import { friendlyError } from '@/lib/errors';

import { ThemeProvider, useTheme } from './theme';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // Background refetch failures surface as a toast; first-load failures render <ErrorState/>.
    onError: (error, query) => {
      if (query.state.data !== undefined) toast.error(friendlyError(error));
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      // Mutations with their own onError — or whose callers handle errors (meta.handlesErrors) — message themselves.
      if (!mutation.options.onError && !mutation.meta?.handlesErrors) toast.error(friendlyError(error));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => count < 2 && !(error as { code?: string }).code?.startsWith('PGRST'),
      refetchOnWindowFocus: true,
    },
  },
});

function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="top-center"
      closeButton
      toastOptions={{
        classNames: {
          toast: '!bg-surface-2 !border-border !text-foreground !rounded-xl !shadow-lift',
          description: '!text-muted-foreground',
        },
      }}
    />
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {/* Honour prefers-reduced-motion for every Framer Motion animation */}
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={250}>
            {children}
            <ThemedToaster />
          </TooltipProvider>
        </MotionConfig>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
