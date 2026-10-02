import { LogoMark } from './Logo';

export function FullPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="studio-glow flex min-h-dvh flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <LogoMark className="h-10 w-10 animate-pulse" />
      <p className="text-sm text-muted-foreground">{label}…</p>
    </div>
  );
}
