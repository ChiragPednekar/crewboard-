import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';

import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { embedUrl, parseLink } from '@/lib/links';
import { cn } from '@/lib/utils';

export interface PlayerHandle {
  /** Current playback position in seconds, or null when the provider can't report it. */
  getTime: () => number | null;
  seek: (seconds: number) => void;
  /** YouTube and Vimeo report their time; Drive/Instagram/others don't. */
  canTrack: boolean;
}

const TRACKABLE = new Set(['youtube', 'vimeo']);

/**
 * Like VideoEmbed, but exposes the player's current time and a seek() for
 * timestamped comments. Talks to YouTube / Vimeo over postMessage only — no
 * third-party scripts are loaded, so the site's CSP stays unchanged.
 */
export const VideoPlayer = forwardRef<PlayerHandle, { url: string; title: string; className?: string; onTime?: (t: number) => void }>(
  function VideoPlayer({ url, title, className, onTime }, ref) {
    const parsed = parseLink(url);
    const provider = parsed?.provider;
    const base = parsed ? embedUrl(parsed) : undefined;
    const iframe = useRef<HTMLIFrameElement>(null);
    const time = useRef<number | null>(null);
    const [loaded, setLoaded] = useState(false);
    const canTrack = Boolean(base && provider && TRACKABLE.has(provider));

    const src = !base
      ? undefined
      : provider === 'youtube'
        ? `${base}&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
        : provider === 'vimeo'
          ? `${base}?api=1`
          : base;

    const post = useCallback(
      (msg: unknown) => {
        const target = iframe.current?.contentWindow;
        if (!target) return;
        target.postMessage(JSON.stringify(msg), '*');
      },
      [],
    );

    useEffect(() => {
      if (!canTrack) return;
      function onMessage(e: MessageEvent) {
        if (e.source !== iframe.current?.contentWindow) return;
        let data: unknown = e.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            return;
          }
        }
        const d = data as { event?: string; info?: { currentTime?: number }; data?: { seconds?: number } };
        let t: number | undefined;
        if (provider === 'youtube' && d.event === 'infoDelivery') t = d.info?.currentTime;
        if (provider === 'vimeo' && (d.event === 'timeupdate' || d.event === 'playProgress')) t = d.data?.seconds;
        if (provider === 'vimeo' && d.event === 'ready') post({ method: 'addEventListener', value: 'timeupdate' });
        if (typeof t === 'number' && Number.isFinite(t)) {
          time.current = t;
          onTime?.(t);
        }
      }
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, [canTrack, provider, post, onTime]);

    function handleLoad() {
      setLoaded(true);
      if (provider === 'youtube') post({ event: 'listening', id: title, channel: 'widget' });
      if (provider === 'vimeo') post({ method: 'addEventListener', value: 'timeupdate' });
    }

    useImperativeHandle(
      ref,
      () => ({
        canTrack,
        getTime: () => (canTrack ? (time.current ?? 0) : null),
        seek: (seconds: number) => {
          if (provider === 'youtube') {
            post({ event: 'command', func: 'seekTo', args: [seconds, true], id: title, channel: 'widget' });
            post({ event: 'command', func: 'playVideo', args: [], id: title, channel: 'widget' });
          } else if (provider === 'vimeo') {
            post({ method: 'setCurrentTime', value: seconds });
            post({ method: 'play' });
          }
          time.current = seconds;
          iframe.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
      }),
      [canTrack, provider, post, title],
    );

    if (!src) return <LinkPreviewCard url={url} className={className} />;
    const tall = provider === 'instagram';
    return (
      <div className={cn('space-y-2', className)}>
        <div className={cn('relative overflow-hidden rounded-lg border border-border bg-black', tall ? 'mx-auto aspect-[9/14] max-w-sm' : 'aspect-video')}>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-surface-2" aria-hidden />}
          <iframe
            ref={iframe}
            src={src}
            title={title}
            loading="lazy"
            onLoad={handleLoad}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full"
          />
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary-text hover:underline"
        >
          Open on {parsed?.providerLabel} <ExternalLink className="h-3 w-3" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    );
  },
);
