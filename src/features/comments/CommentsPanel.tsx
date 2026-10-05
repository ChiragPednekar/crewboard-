import { type RefObject, useState } from 'react';
import { CheckCircle2, Circle, Clock, MessageSquareText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import type { PlayerHandle } from '@/components/VideoPlayer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/features/auth/AuthProvider';
import { timeAgo } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { formatTimecode, parseTimecode } from '@/lib/timecode';
import { cn } from '@/lib/utils';

import { useAddComment, useComments, useDeleteComment, useResolveComment } from './api';

interface CommentsPanelProps {
  taskId: string;
  submissionId: string | null;
  player: RefObject<PlayerHandle>;
  /** The shown link is YouTube/Vimeo, so the player reports its time. */
  trackable: boolean;
  /** Comments are read-only on closed tasks. */
  canWrite: boolean;
  className?: string;
}

/**
 * Frame.io-style notes: pin a comment to the current playback time (YouTube/Vimeo),
 * or type a timecode for Drive and other links. Click a timecode to jump there.
 */
export function CommentsPanel({ taskId, submissionId, player, trackable, canWrite, className }: CommentsPanelProps) {
  const { profile } = useAuth();
  const comments = useComments(taskId);
  const add = useAddComment(taskId);
  const resolve = useResolveComment(taskId);
  const remove = useDeleteComment(taskId);
  const [body, setBody] = useState('');
  const [pin, setPin] = useState(true);
  const [manual, setManual] = useState('');
  const tracks = trackable;
  const manualSeconds = parseTimecode(manual);
  const manualInvalid = manual.trim() !== '' && manualSeconds === null;
  const open = (comments.data ?? []).filter((c) => !c.resolved_at).length;

  function submit() {
    if (!body.trim() || manualInvalid) return;
    const at = tracks ? (pin ? player.current?.getTime() ?? null : null) : manualSeconds;
    add.mutate(
      { body, atSeconds: at, submissionId },
      {
        onSuccess: () => {
          setBody('');
          setManual('');
        },
        onError: (e) => toast.error(friendlyError(e)),
      },
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-primary-text" aria-hidden /> Notes on the video
        </CardTitle>
        {comments.data && comments.data.length > 0 && (
          <span className="text-xs text-muted-foreground">{open === 0 ? 'All resolved' : `${open} open`}</span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {comments.isPending ? (
          <Skeleton className="h-16" />
        ) : (comments.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No notes yet.{canWrite && ' Pause the video where something needs attention and leave a note — it’s pinned to that moment.'}
          </p>
        ) : (
          <ol className="space-y-3">
            {comments.data!.map((c) => {
              const mine = c.author?.id === profile?.id;
              return (
                <li key={c.id} className={cn('flex gap-3 rounded-lg p-2', c.resolved_at && 'opacity-60')}>
                  <UserAvatar name={c.author?.full_name ?? c.author_name ?? '?'} src={c.author?.avatar_url} className="h-7 w-7 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {c.author?.full_name ?? c.author_name ?? 'Someone'}
                        {c.author_staff && !mine && <span className="ml-1 font-normal text-muted-foreground">· studio</span>}
                      </span>
                      {c.at_seconds !== null && (
                        <button
                          type="button"
                          onClick={() => player.current?.seek(Number(c.at_seconds))}
                          disabled={!trackable}
                          className="tabular inline-flex items-center gap-1 rounded bg-primary/12 px-1.5 py-0.5 font-medium text-primary-text hover:bg-primary/20 disabled:cursor-default"
                          aria-label={`Jump to ${formatTimecode(Number(c.at_seconds))}`}
                        >
                          <Clock className="h-3 w-3" aria-hidden /> {formatTimecode(Number(c.at_seconds))}
                        </button>
                      )}
                      <span>{timeAgo(c.created_at)}</span>
                    </p>
                    <p className={cn('mt-0.5 whitespace-pre-line text-sm', c.resolved_at && 'line-through decoration-muted-foreground/50')}>{c.body}</p>
                  </div>
                  <div className="flex shrink-0 items-start gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => resolve.mutate({ id: c.id, resolved: !c.resolved_at })}
                      aria-label={c.resolved_at ? 'Mark as not resolved' : 'Mark as resolved'}
                      title={c.resolved_at ? 'Reopen' : 'Resolve'}
                    >
                      {c.resolved_at ? <CheckCircle2 className="text-success-text" /> : <Circle />}
                    </Button>
                    {mine && (
                      <Button variant="ghost" size="icon-sm" onClick={() => remove.mutate(c.id)} aria-label="Delete note">
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {canWrite && (
          <form
            className="space-y-2 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor={`comment-${taskId}`} className="sr-only">
              Add a note
            </label>
            <Textarea
              id={`comment-${taskId}`}
              rows={2}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="e.g. Logo end-card is missing here"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {tracks ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox id={`pin-${taskId}`} checked={pin} onCheckedChange={(v) => setPin(v === true)} />
                  <label htmlFor={`pin-${taskId}`}>Pin to the current moment</label>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <label htmlFor={`tc-${taskId}`} className="text-sm text-muted-foreground">
                    At
                  </label>
                  <Input
                    id={`tc-${taskId}`}
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    placeholder="0:42"
                    className="tabular h-9 w-20"
                    aria-invalid={manualInvalid || undefined}
                  />
                  {manualInvalid && <span className="text-xs text-danger-text">Use m:ss</span>}
                </div>
              )}
              <Button type="submit" size="sm" loading={add.isPending} disabled={!body.trim() || manualInvalid}>
                Add note
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
