import { describe, expect, it } from 'vitest';

import { clientSchema, emptyClient } from '@/features/clients/schemas';
import { submitSchema } from '@/features/crew/SubmitDialog';
import { taskFormSchema } from '@/features/tasks/schemas';
import { inviteSchema } from '@/features/videographers/schemas';

const messages = (r: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]));

describe('task form', () => {
  const base = {
    title: 'Knee replacement film',
    client_id: 'c',
    category_id: 'k',
    due_date: '2026-10-20',
    shoot_date: '',
    priority: 'normal' as const,
    max_points: 25,
    brief: '',
    assignees: ['v1'],
    refs: [],
  };

  it('accepts a valid task', () => {
    expect(taskFormSchema({ month: '2026-10', creating: true }).safeParse(base).success).toBe(true);
  });

  it('accepts an optional shoot date near the month, rejects far-off ones', () => {
    const schema = taskFormSchema({ month: '2026-10', creating: true });
    expect(schema.safeParse({ ...base, shoot_date: '2026-10-05' }).success).toBe(true);
    expect(schema.safeParse({ ...base, shoot_date: '2026-09-28' }).success).toBe(true);
    const far = schema.safeParse({ ...base, shoot_date: '2027-06-01' });
    expect(far.success).toBe(false);
  });
  it('keeps the due date inside the plan month', () => {
    const r = taskFormSchema({ month: '2026-10', creating: true }).safeParse({ ...base, due_date: '2026-11-01' });
    expect(messages(r).due_date).toBe('The due date must be in October 2026');
  });

  it('needs someone to assign it to when creating, not when editing', () => {
    expect(messages(taskFormSchema({ month: '2026-10', creating: true }).safeParse({ ...base, assignees: [] })).assignees).toBe('Pick at least one videographer');
    expect(taskFormSchema({ month: '2026-10', creating: false }).safeParse({ ...base, assignees: [] }).success).toBe(true);
  });

  it('rejects missing or fractional points with a readable message', () => {
    const schema = taskFormSchema({ month: '2026-10', creating: true });
    expect(messages(schema.safeParse({ ...base, max_points: Number.NaN })).max_points).toBe('Enter the points this task is worth');
    expect(messages(schema.safeParse({ ...base, max_points: 2.5 })).max_points).toBe('Whole numbers only');
  });

  it('only accepts http(s) reference links', () => {
    const r = taskFormSchema({ month: '2026-10', creating: true }).safeParse({ ...base, refs: [{ kind: 'link', url: 'javascript:alert(1)', title: '', meta: {} }] });
    expect(r.success).toBe(false);
  });
});

describe('submission form', () => {
  it('needs 1–5 unique http(s) links', () => {
    expect(submitSchema.safeParse({ links: [{ url: 'https://youtu.be/a' }], notes: '' }).success).toBe(true);
    expect(messages(submitSchema.safeParse({ links: [{ url: 'drive folder' }], notes: '' }))['links.0.url']).toMatch(/full link/);
    expect(messages(submitSchema.safeParse({ links: [{ url: 'https://youtu.be/a' }, { url: 'https://YOUTU.be/a' }], notes: '' }))['links.1.url']).toBe('This link is already in the list');
    expect(submitSchema.safeParse({ links: Array.from({ length: 6 }, (_, i) => ({ url: `https://a.b/${i}` })), notes: '' }).success).toBe(false);
  });
});

describe('client + invite forms', () => {
  it('validates optional contact fields only when filled', () => {
    expect(clientSchema.safeParse({ ...emptyClient, name: 'Kesar Foods' }).success).toBe(true);
    expect(messages(clientSchema.safeParse({ ...emptyClient, name: 'Kesar', contact_email: 'nope' })).contact_email).toBe('Enter a valid email');
    expect(messages(clientSchema.safeParse({ ...emptyClient, name: 'Kesar', contact_phone: 'call me' })).contact_phone).toMatch(/digits/);
  });

  it('normalises invite emails to lower case', () => {
    const r = inviteSchema.safeParse({ full_name: 'Meera Joshi', email: ' Meera@Crewboard.Test ', phone: '', base_location: '', client_ids: [] });
    expect(r.success && r.data.email).toBe('meera@crewboard.test');
  });
});
