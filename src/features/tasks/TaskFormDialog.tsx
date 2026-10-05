import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { BellRing, ChevronDown, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { CheckList } from '@/components/CheckList';
import { PRIORITY_META } from '@/components/Chips';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/UserAvatar';
import { useCategories, useClientOptions, useCrewOptions } from '@/features/lookups/api';
import { useOnOpen } from '@/hooks/useOnOpen';
import { useVideographer } from '@/features/videographers/api';
import { defaultDueDate, formatMonth, monthBounds } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import type { PlanStatus, Task } from '@/lib/supabase';
import { cn } from '@/lib/utils';

import { useCreateTasks, useUpdateTask } from './api';
import { ReferenceDrafts } from './ReferenceDrafts';
import { PRIORITIES, taskFormSchema, type TaskFormValues } from './schemas';

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  /** Plan owner when adding from a plan; omit to pick people (assign-to-many). */
  videographerId?: string;
  planStatus?: PlanStatus | null;
  /** Edit mode */
  task?: Pick<Task, 'id' | 'title' | 'brief' | 'client_id' | 'category_id' | 'due_date' | 'shoot_date' | 'priority' | 'max_points' | 'status' | 'points_awarded'>;
  onCreated?: (count: number) => void;
}

export function TaskFormDialog({ open, onOpenChange, month, videographerId, planStatus, task, onCreated }: TaskFormDialogProps) {
  const creating = !task;
  const schema = useMemo(() => taskFormSchema({ month, creating }), [month, creating]);
  const categories = useCategories();
  const clients = useClientOptions();
  const crew = useCrewOptions();
  const owner = useVideographer(videographerId ?? '');
  const create = useCreateTasks();
  const update = useUpdateTask();
  const pending = create.isPending || update.isPending;
  const [showMore, setShowMore] = useState(!videographerId);
  const { first, last } = monthBounds(month);

  const defaults = useMemo<TaskFormValues>(
    () =>
      task
        ? {
            title: task.title,
            brief: task.brief ?? '',
            client_id: task.client_id,
            category_id: task.category_id,
            due_date: task.due_date,
            shoot_date: task.shoot_date ?? '',
            priority: task.priority,
            max_points: task.max_points,
            assignees: [],
            refs: [],
          }
        : {
            title: '',
            brief: '',
            client_id: '',
            category_id: '',
            due_date: defaultDueDate(month),
            shoot_date: '',
            priority: 'normal',
            max_points: Number.NaN,
            assignees: videographerId ? [videographerId] : [],
            refs: [],
          },
    [task, month, videographerId],
  );

  const form = useForm<TaskFormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  useOnOpen(open, () => {
    form.reset(defaults);
    setShowMore(!videographerId);
  });

  // Client picker: the owner's clients first, then everyone else (active only, plus the current one).
  const clientGroups = useMemo(() => {
    const list = (clients.data ?? []).filter((c) => c.is_active || c.id === task?.client_id);
    const mine = new Set((owner.data?.clients ?? []).map((c) => c.id));
    return {
      mine: list.filter((c) => mine.has(c.id)),
      others: list.filter((c) => !mine.has(c.id)),
    };
  }, [clients.data, owner.data, task?.client_id]);

  const activeCategories = (categories.data ?? []).filter((c) => c.is_active || c.id === task?.category_id);
  const ownerName = owner.data?.full_name.split(' ')[0];
  const assignees = form.watch('assignees');
  const pointsLocked = task?.status === 'approved';

  function onCategoryChange(id: string) {
    form.setValue('category_id', id, { shouldDirty: true, shouldValidate: true });
    const points = form.getFieldState('max_points');
    const cat = categories.data?.find((c) => c.id === id);
    if (cat && creating && !points.isDirty) form.setValue('max_points', cat.default_max_points, { shouldValidate: form.formState.isSubmitted });
  }

  function onSubmit(values: TaskFormValues) {
    if (task) {
      update.mutate(
        { id: task.id, values },
        {
          onSuccess: () => {
            toast.success('Task updated');
            onOpenChange(false);
          },
          onError: (e) => toast.error(friendlyError(e)),
        },
      );
      return;
    }
    create.mutate(
      { month, values },
      {
        onSuccess: (rows) => {
          const n = rows?.length ?? values.assignees.length;
          toast.success(n > 1 ? `Task added for ${n} videographers` : 'Task added');
          onCreated?.(n);
          onOpenChange(false);
        },
        onError: (e) => toast.error(friendlyError(e)),
      },
    );
  }

  const crewOptions = (crew.data ?? [])
    .filter((p) => p.is_active)
    .map((p) => ({
      value: p.id,
      label: p.full_name,
      hint: p.id === videographerId ? 'This plan' : undefined,
      disabled: p.id === videographerId,
      leading: <UserAvatar name={p.full_name} src={p.avatar_url} className="h-7 w-7 text-[11px]" />,
    }));

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : videographerId ? `New task${ownerName ? ` for ${ownerName}` : ''}` : 'New task for several people'}</DialogTitle>
          <DialogDescription>
            {formatMonth(month)} · {task ? 'Changes are logged in the task history.' : 'References can be added now or later on the task page.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Knee replacement – patient testimonial" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clientGroups.mine.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>{ownerName ? `${ownerName}’s clients` : 'Assigned clients'}</SelectLabel>
                            {clientGroups.mine.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {clientGroups.others.length > 0 && (
                          <SelectGroup>
                            {clientGroups.mine.length > 0 && <SelectLabel>Other clients</SelectLabel>}
                            {clientGroups.others.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={onCategoryChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} <span className="text-muted-foreground">· {c.default_max_points} pts</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="shoot_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shoot date (optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due date</FormLabel>
                    <FormControl>
                      <Input type="date" min={first} max={last} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITIES.map((p) => {
                          const Icon = PRIORITY_META[p].icon;
                          return (
                            <SelectItem key={p} value={p}>
                              <span className="inline-flex items-center gap-2">
                                <Icon className={cn('h-3.5 w-3.5', p === 'urgent' ? 'text-danger-text' : p === 'high' ? 'text-warning-text' : 'text-muted-foreground')} aria-hidden />
                                {PRIORITY_META[p].label}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="max_points"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max points</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={1000}
                        step={1}
                        disabled={pointsLocked}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={Number.isNaN(field.value) ? '' : field.value}
                        onChange={(e) => field.onChange(e.target.value === '' ? Number.NaN : e.target.valueAsNumber)}
                        className="tabular"
                      />
                    </FormControl>
                    {pointsLocked && <FormDescription>Locked after approval.</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="brief"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brief</FormLabel>
                  <FormControl>
                    <Textarea rows={5} placeholder="What to shoot, who to meet, deliverable format and length, anything the client insists on…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {creating && (
              <FormField
                control={form.control}
                name="refs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>References</FormLabel>
                    <FormDescription>Example videos, mood boards or notes. Files can be uploaded on the task page.</FormDescription>
                    <ReferenceDrafts value={field.value} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {creating && (
              <FormField
                control={form.control}
                name="assignees"
                render={({ field }) => (
                  <FormItem>
                    {videographerId ? (
                      <button
                        type="button"
                        onClick={() => setShowMore((s) => !s)}
                        className="flex h-10 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                        aria-expanded={showMore}
                      >
                        <Users className="h-4 w-4" aria-hidden />
                        Give the same task to other videographers
                        {assignees.length > 1 && <span className="text-primary-text">(+{assignees.length - 1})</span>}
                        <ChevronDown className={cn('h-4 w-4 transition-transform', showMore && 'rotate-180')} aria-hidden />
                      </button>
                    ) : (
                      <>
                        <FormLabel>Videographers</FormLabel>
                        <FormDescription>Each person gets their own copy in their {formatMonth(month, 'MMMM')} plan. Missing plans are created as drafts.</FormDescription>
                      </>
                    )}
                    {showMore && (
                      <CheckList label="Videographers" options={crewOptions} value={field.value} onChange={field.onChange} searchPlaceholder="Search crew" emptyText="No active videographers." />
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {creating && videographerId && planStatus === 'published' && (
              <p className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-xs text-info-text">
                <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                This plan is published, so {ownerName ?? 'they'} will be notified as soon as you add the task.
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                {task ? 'Save changes' : assignees.length > 1 ? `Add for ${assignees.length} people` : 'Add task'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
