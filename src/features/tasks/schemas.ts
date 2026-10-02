import { z } from 'zod';

import { formatMonth, isInMonth } from '@/lib/dates';
import { isHttpUrl } from '@/lib/links';

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export const refDraftSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('link'),
    url: z.string().refine(isHttpUrl, 'Enter a full http(s) link'),
    title: z.string().max(200),
    meta: z.record(z.unknown()),
  }),
  z.object({ kind: z.literal('note'), note: z.string().trim().min(1).max(4000) }),
]);
export type RefDraft = z.infer<typeof refDraftSchema>;

export function taskFormSchema({ month, creating }: { month: string; creating: boolean }) {
  return z
    .object({
      title: z.string().trim().min(2, 'Give the task a short title').max(200, 'Keep it under 200 characters'),
      client_id: z.string().min(1, 'Pick a client'),
      category_id: z.string().min(1, 'Pick a category'),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a due date'),
      priority: z.enum(PRIORITIES),
      max_points: z
        .number({ invalid_type_error: 'Enter the points this task is worth' })
        .int('Whole numbers only')
        .min(1, 'At least 1 point')
        .max(1000, 'At most 1000 points'),
      brief: z.string().trim().max(8000, 'Keep the brief under 8000 characters'),
      assignees: z.array(z.string()),
      refs: z.array(refDraftSchema).max(20, 'Add at most 20 references here; add more on the task page'),
    })
    .superRefine((v, ctx) => {
      if (v.due_date && !isInMonth(v.due_date, month)) {
        ctx.addIssue({ code: 'custom', path: ['due_date'], message: `The due date must be in ${formatMonth(month)}` });
      }
      if (creating && v.assignees.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['assignees'], message: 'Pick at least one videographer' });
      }
    });
}

export type TaskFormValues = z.infer<ReturnType<typeof taskFormSchema>>;
