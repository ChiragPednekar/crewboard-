import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarPlus, Check, Palmtree, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Segmented } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/UserAvatar';
import { formatDate, todayKey } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';

import {
  LEAVE_KIND_LABEL,
  type LeaveKind,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveWithPerson,
  useDecideLeave,
  useLeaveRequests,
  useMyLeave,
  useRequestLeave,
  useWithdrawLeave,
} from './api';

const STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: 'bg-warning/12 text-warning-text ring-warning/30',
  approved: 'bg-success/12 text-success-text ring-success/25',
  rejected: 'bg-danger/12 text-danger-text ring-danger/25',
  cancelled: 'bg-muted-foreground/10 text-muted-foreground ring-border',
};

function LeaveStatusChip({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium capitalize ring-1 ring-inset', STATUS_STYLE[status as LeaveStatus])}>
      {status}
    </span>
  );
}

function dateRange(l: Pick<LeaveRequest, 'start_date' | 'end_date'>) {
  return l.start_date === l.end_date
    ? formatDate(l.start_date, 'EEE d MMM yyyy')
    : `${formatDate(l.start_date, 'd MMM')} – ${formatDate(l.end_date, 'd MMM yyyy')}`;
}

function days(l: Pick<LeaveRequest, 'start_date' | 'end_date'>) {
  return Math.round((Date.parse(l.end_date) - Date.parse(l.start_date)) / 86_400_000) + 1;
}

const requestSchema = z
  .object({
    kind: z.enum(['leave', 'sick', 'unavailable']),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick an end date'),
    reason: z.string().trim().max(500, 'Keep it under 500 characters'),
  })
  .refine((v) => v.end_date >= v.start_date, { path: ['end_date'], message: 'The end date must be on or after the start date' })
  .refine((v) => days(v) <= 93, { path: ['end_date'], message: 'Requests can cover at most 3 months' });
type RequestValues = z.infer<typeof requestSchema>;

/** /me/leave — request time off and see past requests. */
export function MyLeavePage() {
  const list = useMyLeave();
  const request = useRequestLeave();
  const withdraw = useWithdrawLeave();
  const [confirm, setConfirm] = useState<LeaveRequest | null>(null);
  const form = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { kind: 'leave', start_date: todayKey(), end_date: todayKey(), reason: '' },
  });

  function submit(v: RequestValues) {
    request.mutate(v, {
      onSuccess: () => {
        toast.success('Request sent', { description: 'Your admin has been notified.' });
        form.reset({ kind: 'leave', start_date: todayKey(), end_date: todayKey(), reason: '' });
      },
      onError: (e) => toast.error(friendlyError(e)),
    });
  }

  return (
    <>
      <PageHeader title="Leave & availability" description="Tell the studio when you can’t shoot. Approved leave shows on the shoot calendar." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card className="lg:self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-primary-text" aria-hidden /> New request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
                <FormField
                  control={form.control}
                  name="kind"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(Object.keys(LEAVE_KIND_LABEL) as LeaveKind[]).map((k) => (
                            <SelectItem key={k} value={k}>
                              {LEAVE_KIND_LABEL[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>To</FormLabel>
                        <FormControl>
                          <Input type="date" min={form.watch('start_date')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note (optional)</FormLabel>
                      <FormControl>
                        <Textarea rows={3} maxLength={500} placeholder="e.g. Family function in Pune" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" loading={request.isPending}>
                  Send request
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : list.isPending ? (
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
          ) : list.data.length === 0 ? (
            <EmptyState icon={Palmtree} title="No requests yet" description="Your leave requests and their status will appear here." />
          ) : (
            list.data.map((l) => {
              const canWithdraw = (l.status === 'pending' || l.status === 'approved') && l.end_date >= todayKey();
              return (
                <Card key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{dateRange(l)}</p>
                    <p className="text-sm text-muted-foreground">
                      {LEAVE_KIND_LABEL[l.kind as LeaveKind]} · {days(l)} {days(l) === 1 ? 'day' : 'days'}
                      {l.reason ? ` · ${l.reason}` : ''}
                    </p>
                    {l.review_note && <p className="mt-1 text-sm">Admin: {l.review_note}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <LeaveStatusChip status={l.status} />
                    {canWithdraw && (
                      <Button variant="ghost" size="sm" onClick={() => setConfirm(l)}>
                        {l.status === 'pending' ? 'Withdraw' : 'Cancel'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.status === 'pending' ? 'Withdraw this request?' : 'Cancel this approved leave?'}
        description={confirm ? dateRange(confirm) : undefined}
        confirmLabel={confirm?.status === 'pending' ? 'Withdraw' : 'Cancel leave'}
        destructive
        loading={withdraw.isPending}
        onConfirm={() =>
          confirm &&
          withdraw.mutate(confirm, {
            onSuccess: () => {
              toast.success('Done');
              setConfirm(null);
            },
            onError: (e) => toast.error(friendlyError(e)),
          })
        }
      />
    </>
  );
}

/** /admin/leave — approve or reject requests. */
export function AdminLeavePage() {
  const [status, setStatus] = useState<LeaveStatus | 'all'>('pending');
  const list = useLeaveRequests(status);
  const decide = useDecideLeave();
  const [target, setTarget] = useState<{ leave: LeaveWithPerson; decision: 'approved' | 'rejected' } | null>(null);
  const [note, setNote] = useState('');

  return (
    <>
      <PageHeader
        title="Leave requests"
        description="Approved leave blocks the shoot calendar and warns you about clashing shoots."
        actions={
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : list.data.length === 0 ? (
        <EmptyState icon={Palmtree} title={status === 'pending' ? 'No pending requests' : 'Nothing here'} description="Requests from the crew appear here." />
      ) : (
        <div className="space-y-3">
          {list.data.map((l) => (
            <Card key={l.id} className="flex flex-wrap items-center gap-4 p-4">
              {l.videographer && <UserAvatar name={l.videographer.full_name} src={l.videographer.avatar_url} />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {l.videographer?.full_name} · {dateRange(l)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {LEAVE_KIND_LABEL[l.kind as LeaveKind]} · {days(l)} {days(l) === 1 ? 'day' : 'days'}
                  {l.reason ? ` · “${l.reason}”` : ''}
                </p>
                {l.review_note && <p className="mt-1 text-sm">Note: {l.review_note}</p>}
              </div>
              {l.status === 'pending' ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setNote('');
                      setTarget({ leave: l, decision: 'rejected' });
                    }}
                  >
                    <X /> Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setNote('');
                      setTarget({ leave: l, decision: 'approved' });
                    }}
                  >
                    <Check /> Approve
                  </Button>
                </div>
              ) : (
                <LeaveStatusChip status={l.status} />
              )}
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target?.decision === 'approved' ? 'Approve this leave?' : 'Reject this request?'}
        description={target ? `${target.leave.videographer?.full_name} · ${dateRange(target.leave)}` : undefined}
        confirmLabel={target?.decision === 'approved' ? 'Approve' : 'Reject'}
        destructive={target?.decision === 'rejected'}
        loading={decide.isPending}
        onConfirm={() =>
          target &&
          decide.mutate(
            { id: target.leave.id, decision: target.decision, note },
            {
              onSuccess: () => {
                toast.success(target.decision === 'approved' ? 'Leave approved' : 'Request rejected', { description: 'They’ve been notified.' });
                setTarget(null);
              },
              onError: (e) => toast.error(friendlyError(e)),
            },
          )
        }
      >
        <div className="space-y-2">
          <label htmlFor="leave-note" className="text-sm font-medium">
            Note to them (optional)
          </label>
          <Textarea id="leave-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </ConfirmDialog>
    </>
  );
}
