import { Compass, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="This page doesn’t exist"
      description="The link may be old, or the page has moved."
      action={
        <Button asChild>
          <Link to="/">Go to the leaderboard</Link>
        </Button>
      }
    />
  );
}

/** Router-level error boundary: an unexpected crash never shows a blank screen. */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';
  // Stale lazy chunks after a deploy: a reload fixes it.
  const isChunkError = /dynamically imported module|Loading chunk/i.test(message);

  return (
    <div className="studio-glow grid min-h-dvh place-items-center px-4">
      <EmptyState
        icon={TriangleAlert}
        title={isChunkError ? 'A new version is available' : 'Something went wrong'}
        description={isChunkError ? 'Reload to get the latest CrewBoard.' : message}
        className="max-w-lg bg-surface"
        action={
          <div className="flex gap-2">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Button asChild variant="secondary">
              <Link to="/">Home</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
