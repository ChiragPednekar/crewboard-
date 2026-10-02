import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlarmClock, ImagePlus, Plus, Send, X } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useOnOpen } from '@/hooks/useOnOpen';
import { formatDate, todayKey } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { isHttpUrl } from '@/lib/links';
import type { Task } from '@/lib/supabase';

import { THUMB_MAX_BYTES, THUMB_TYPES, useSubmitTask } from './api';

export const submitSchema = z.object({
  links: z
    .array(z.object({ url: z.string().trim().refine(isHttpUrl, 'Paste the full link, starting with https://') }))
    .min(1, 'Add at least one link')
    .max(5, 'You can submit at most 5 links')
    .superRefine((links, ctx) => {
      const seen = new Set<string>();
      links.forEach((l, i) => {
        const key = l.url.trim().toLowerCase();
        if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [i, 'url'], message: 'This link is already in the list' });
        seen.add(key);
      });
    }),
  notes: z.string().trim().max(4000, 'Keep notes under 4000 characters'),
});
export type SubmitValues = z.infer<typeof submitSchema>;

interface SubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Pick<Task, 'id' | 'title' | 'due_date' | 'first_submitted_at'>;
  /** Links of the latest version, to start a resubmission from. */
  previousLinks?: string[];
  isResubmission: boolean;
}

export function SubmitDialog({ open, onOpenChange, task, previousLinks, isResubmission }: SubmitDialogProps) {
  const submit = useSubmitTask();
  const fileRef = useRef<HTMLInputElement>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState<string | null>(null);

  const defaults: SubmitValues = {
    links: (previousLinks?.length ? previousLinks : ['']).map((url) => ({ url })),
    notes: '',
  };
  const form = useForm<SubmitValues>({ resolver: zodResolver(submitSchema), defaultValues: defaults });
  const links = useFieldArray({ control: form.control, name: 'links' });

  useOnOpen(open, () => {
    form.reset(defaults);
    setThumb(null);
    setThumbError(null);
  });

  useEffect(() => {
    if (!thumb) {
      setThumbPreview(null);
      return;
    }
    const url = URL.createObjectURL(thumb);
    setThumbPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumb]);

  const late = !task.first_submitted_at && todayKey() > task.due_date;
  const watched = form.watch('links');

  function pickThumb(file: File | undefined) {
    if (!file) return;
    if (!THUMB_TYPES.includes(file.type)) return setThumbError('Use a JPG, PNG or WebP image.');
    if (file.size > THUMB_MAX_BYTES) return setThumbError('The image must be 5 MB or smaller.');
    setThumbError(null);
    setThumb(file);
  }

  function onSubmit(values: SubmitValues) {
    submit.mutate(
      { taskId: task.id, links: values.links.map((l) => l.url.trim()), notes: values.notes, thumbnail: thumb },
      {
        onSuccess: (s) => {
          toast.success(s && s.version > 1 ? `Version ${s.version} submitted` : 'Submitted for review', {
            description: 'Your admin has been notified.',
          });
          onOpenChange(false);
        },
        onError: (e) => toast.error(friendlyError(e)),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submit.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isResubmission ? 'Submit a new version' : 'Submit your work'}</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>

        {late && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-text">
            <AlarmClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            This was due {formatDate(task.due_date, 'd MMM')}, so it will count as late. Submit anyway — late is better than missing.
          </p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Deliverable links</legend>
              <p className="text-sm text-muted-foreground">YouTube (unlisted is fine), Vimeo, Google Drive, Dropbox, Frame.io… Up to 5.</p>
              {links.fields.map((f, i) => {
                const value = watched[i]?.url?.trim() ?? '';
                return (
                  <div key={f.id} className="space-y-2">
                    <FormField
                      control={form.control}
                      name={`links.${i}.url`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Link {i + 1}</FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input type="url" inputMode="url" placeholder="https://" {...field} />
                            </FormControl>
                            {links.fields.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" onClick={() => links.remove(i)} aria-label={`Remove link ${i + 1}`}>
                                <X />
                              </Button>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {isHttpUrl(value) && <LinkPreviewCard url={value} autoMeta={false} />}
                  </div>
                );
              })}
              {links.fields.length < 5 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => links.append({ url: '' })}>
                  <Plus /> Add another link
                </Button>
              )}
              {form.formState.errors.links?.root?.message && (
                <p className="text-sm text-danger-text">{form.formState.errors.links.root.message}</p>
              )}
            </fieldset>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes for your admin</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder={isResubmission ? 'What changed in this version?' : 'Anything they should know: music licence, which cut is final…'} {...field} />
                  </FormControl>
                  <FormDescription>Optional.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <Label htmlFor="thumb-input">Thumbnail</Label>
              <p className="text-sm text-muted-foreground">Optional. A still from the video helps if your work is picked as Best Work of the Month.</p>
              {thumbPreview ? (
                <div className="relative w-48 overflow-hidden rounded-lg border border-border">
                  <img src={thumbPreview} alt="Selected thumbnail" className="aspect-video w-full object-cover" />
                  <Button type="button" variant="secondary" size="icon-sm" className="absolute right-1.5 top-1.5" onClick={() => setThumb(null)} aria-label="Remove thumbnail">
                    <X />
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <ImagePlus /> Choose image
                </Button>
              )}
              <input
                id="thumb-input"
                ref={fileRef}
                type="file"
                accept={THUMB_TYPES.join(',')}
                className="sr-only"
                onChange={(e) => {
                  pickThumb(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {thumbError && (
                <p className="text-sm text-danger-text" role="alert">
                  {thumbError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
                Cancel
              </Button>
              <Button type="submit" loading={submit.isPending}>
                {!submit.isPending && <Send />} {isResubmission ? 'Submit new version' : 'Submit for review'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
