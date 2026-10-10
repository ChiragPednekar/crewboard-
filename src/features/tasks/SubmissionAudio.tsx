import { Download, Music } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { useAudioUrl } from './api';

/** Player for the audio file attached to a submission. */
export function SubmissionAudio({ path, name, className }: { path: string; name: string | null; className?: string }) {
  const url = useAudioUrl(path);
  const label = name || 'Audio file';
  return (
    <div className={cn('rounded-lg border border-border p-3', className)}>
      <div className="mb-2 flex items-center gap-2 text-sm">
        <Music className="h-4 w-4 shrink-0 text-primary-text" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium" title={label}>
          {label}
        </span>
        {url.data && (
          <a href={url.data} download={label} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Download className="h-3.5 w-3.5" aria-hidden /> Download
          </a>
        )}
      </div>
      {url.data ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- crew-uploaded audio has no caption track
        <audio controls preload="metadata" src={url.data} className="w-full" aria-label={label} />
      ) : url.isError ? (
        <p className="text-sm text-danger-text">Couldn’t load the audio file.</p>
      ) : (
        <Skeleton className="h-10" />
      )}
    </div>
  );
}
