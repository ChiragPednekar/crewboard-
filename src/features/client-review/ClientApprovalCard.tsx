import { useState } from 'react';
import { Copy, Link2, MessageCircle, ShieldOff, Star, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';

import { approvalUrl, type ClientReviewLink, useClientLinks, useCreateClientLink, useRevokeClientLink } from './api';

function linkState(l: ClientReviewLink): 'responded' | 'revoked' | 'expired' | 'open' {
  if (l.responded_at) return 'responded';
  if (l.revoked_at) return 'revoked';
  if (new Date(l.expires_at) < new Date()) return 'expired';
  return 'open';
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Link copied');
  } catch {
    toast.error('Couldn’t copy — select the link and copy it manually');
  }
}

/** Send the client a no-login page to approve the cut and rate it. */
export function ClientApprovalCard({ taskId, submissionId, taskTitle }: { taskId: string; submissionId: string; taskTitle: string }) {
  const links = useClientLinks(taskId);
  const create = useCreateClientLink(taskId);
  const revoke = useRevokeClientLink(taskId);
  const [contact, setContact] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);

  function makeLink() {
    create.mutate(
      { submissionId, contact, days: 14 },
      {
        onSuccess: (token) => {
          const url = approvalUrl(token);
          setFresh(url);
          setContact('');
          void copy(url);
        },
        onError: (e) => toast.error(friendlyError(e)),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-primary-text" aria-hidden /> Client approval
        </CardTitle>
        <p className="text-sm text-muted-foreground">Send the client a private link to approve this cut and rate it. No account needed.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            makeLink();
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={`client-contact-${taskId}`} className="text-xs">
              For (optional)
            </Label>
            <Input
              id={`client-contact-${taskId}`}
              value={contact}
              maxLength={120}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. Dr. Iyer, PR head"
              className="h-9"
            />
          </div>
          <Button type="submit" size="sm" loading={create.isPending}>
            <Link2 /> Create link
          </Button>
        </form>

        {fresh && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="mb-2 font-medium">Link ready — valid for 14 days</p>
            <p className="break-all text-xs text-muted-foreground">{fresh}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void copy(fresh)}>
                <Copy /> Copy again
              </Button>
              <Button asChild size="sm" variant="secondary">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Please review “${taskTitle}” and let us know if it’s good to go: ${fresh}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="text-success-text" /> Share on WhatsApp
                </a>
              </Button>
            </div>
          </div>
        )}

        {links.isPending ? (
          <Skeleton className="h-12" />
        ) : (links.data ?? []).length > 0 ? (
          <ul className="space-y-2">
            {links.data!.map((l) => {
              const state = linkState(l);
              return (
                <li key={l.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{l.client_contact || 'Client link'}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        state === 'responded'
                          ? l.decision === 'approved'
                            ? 'bg-success/12 text-success-text'
                            : 'bg-danger/12 text-danger-text'
                          : state === 'open'
                            ? 'bg-info/12 text-info-text'
                            : 'bg-muted-foreground/10 text-muted-foreground',
                      )}
                    >
                      {state === 'responded' ? (l.decision === 'approved' ? 'Approved' : 'Changes asked') : state === 'open' ? 'Waiting' : state === 'revoked' ? 'Revoked' : 'Expired'}
                    </span>
                  </div>
                  {state === 'responded' && (
                    <div className="mt-1.5">
                      <p className="flex items-center gap-0.5 text-gold" aria-label={`${l.rating} out of 5`}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star key={i} className={cn('h-3.5 w-3.5', i < (l.rating ?? 0) ? 'fill-current' : 'opacity-30')} aria-hidden />
                        ))}
                        {l.responder_name && <span className="ml-2 text-xs text-muted-foreground">by {l.responder_name}</span>}
                      </p>
                      {l.comment && <p className="mt-1 whitespace-pre-line text-muted-foreground">“{l.comment}”</p>}
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(l.responded_at!)}</p>
                    </div>
                  )}
                  {state === 'open' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => void copy(approvalUrl(l.token))}>
                        <Copy /> Copy link
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-danger-text" onClick={() => revoke.mutate(l.id)}>
                        <ShieldOff /> Revoke
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
