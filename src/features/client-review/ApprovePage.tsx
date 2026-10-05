import { useState } from 'react';
import { CheckCircle2, Clock, LinkIcon, RotateCcw, ShieldOff } from 'lucide-react';
import { useParams } from 'react-router';
import { toast } from 'sonner';

import { ClientLogo } from '@/components/ClientLogo';
import { EmptyState } from '@/components/EmptyState';
import { Logo } from '@/components/Logo';
import { StarRating } from '@/components/StarRating';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { VideoEmbed } from '@/components/VideoEmbed';
import { Segmented } from '@/components/Toolbar';
import { formatDateTime } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';

import { usePublicClientReview, useSubmitClientReview } from './api';

/** /approve/:token — the studio's client approves a cut and rates it, without an account. */
export default function ApprovePage() {
  const { token = '' } = useParams();
  const review = usePublicClientReview(token);
  const submit = useSubmitClientReview(token);
  const [decision, setDecision] = useState<'approved' | 'changes'>('approved');
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const r = review.data;
  const errors = {
    rating: !rating ? 'Pick a rating' : null,
    comment: decision === 'changes' && !comment.trim() ? 'Tell us what you’d like changed' : null,
  };

  return (
    <div className="studio-glow min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        {review.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="aspect-video rounded-xl" />
          </div>
        ) : review.isError || !r || r.state === 'invalid' ? (
          <EmptyState icon={LinkIcon} title="This link isn’t valid" description="Ask the studio to send you a fresh review link." className="bg-surface" />
        ) : r.state === 'revoked' || r.state === 'expired' ? (
          <EmptyState
            icon={r.state === 'revoked' ? ShieldOff : Clock}
            title={r.state === 'revoked' ? 'This link was withdrawn' : 'This link has expired'}
            description="Ask the studio to send you a fresh review link."
            className="bg-surface"
          />
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              {r.client && <ClientLogo name={r.client} src={r.client_logo ?? null} className="h-11 w-11" />}
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary-text">
                  {[r.client, r.category].filter(Boolean).join(' · ')}
                </p>
                <h1 className="font-display text-2xl font-semibold sm:text-3xl">{r.title}</h1>
                <p className="text-sm text-muted-foreground">
                  Version {r.version}
                  {r.videographer ? ` · filmed by ${r.videographer}` : ''}
                  {r.submitted_at ? ` · ${formatDateTime(r.submitted_at, 'd MMM yyyy')}` : ''}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {(r.links ?? []).map((l, i) => (
                <VideoEmbed key={l} url={l} title={`${r.title}, part ${i + 1}`} />
              ))}
              {(r.links ?? []).length === 0 && <p className="text-sm text-muted-foreground">The studio hasn’t attached a playable link to this version.</p>}
            </div>

            <Card className="mt-6">
              <CardContent className="p-5 sm:p-6">
                {r.state === 'responded' ? (
                  <div className="text-center">
                    {r.decision === 'approved' ? (
                      <CheckCircle2 className="mx-auto h-8 w-8 text-success-text" aria-hidden />
                    ) : (
                      <RotateCcw className="mx-auto h-8 w-8 text-warning-text" aria-hidden />
                    )}
                    <p className="mt-3 font-display text-xl font-semibold">
                      {r.decision === 'approved' ? 'Thanks — approved!' : 'Thanks — we’ll make the changes'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.responder_name ? `${r.responder_name} · ` : ''}
                      {r.rating}★{r.responded_at ? ` · ${formatDateTime(r.responded_at)}` : ''}
                    </p>
                    {r.comment && <p className="mx-auto mt-3 max-w-md whitespace-pre-line text-sm">“{r.comment}”</p>}
                  </div>
                ) : (
                  <form
                    className="space-y-5"
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      setTouched(true);
                      if (errors.rating || errors.comment) return;
                      submit.mutate(
                        { decision, rating: rating!, comment, name },
                        {
                          onSuccess: () => toast.success('Thank you! The studio has been notified.'),
                          onError: (err) => toast.error(friendlyError(err)),
                        },
                      );
                    }}
                  >
                    <div>
                      <p className="font-display text-lg font-semibold">Is this good to go?</p>
                      <p className="text-sm text-muted-foreground">Your feedback goes straight to the team.</p>
                    </div>
                    <Segmented
                      fill
                      label="Decision"
                      value={decision}
                      onChange={setDecision}
                      options={[
                        { value: 'approved', label: 'Approve' },
                        { value: 'changes', label: 'Request changes' },
                      ]}
                    />
                    <div className="space-y-2">
                      <Label asChild>
                        <span>How happy are you with it?</span>
                      </Label>
                      <StarRating value={rating} onChange={setRating} invalid={touched && Boolean(errors.rating)} />
                      {touched && errors.rating && <p className="text-sm text-danger-text">{errors.rating}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="client-comment">{decision === 'changes' ? 'What should we change?' : 'Comments (optional)'}</Label>
                      <Textarea
                        id="client-comment"
                        rows={4}
                        maxLength={2000}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        aria-invalid={(touched && Boolean(errors.comment)) || undefined}
                        placeholder={decision === 'changes' ? 'Timestamps help, e.g. “at 0:42 the logo is missing”' : 'Anything you loved?'}
                      />
                      {touched && errors.comment && <p className="text-sm text-danger-text">{errors.comment}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="client-name">Your name (optional)</Label>
                      <Input id="client-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                    </div>
                    <Button type="submit" size="lg" className="w-full" loading={submit.isPending} variant={decision === 'approved' ? 'default' : 'destructive'}>
                      {decision === 'approved' ? 'Approve' : 'Send change request'}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      You can respond once. This link expires {r.expires_at ? formatDateTime(r.expires_at, 'd MMM yyyy') : 'soon'}.
                    </p>
                  </form>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
