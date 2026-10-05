import { describe, expect, it } from 'vitest';

import { canOpen } from './guards';

describe('canOpen (post-login redirect target)', () => {
  it('keeps admin pages for admins only', () => {
    expect(canOpen('admin', '/admin/clients')).toBe(true);
    expect(canOpen('videographer', '/admin/clients')).toBe(false);
    expect(canOpen('videographer', '/admin')).toBe(false);
  });
  it('keeps crew pages for videographers only', () => {
    expect(canOpen('videographer', '/me/tasks/123')).toBe(true);
    expect(canOpen('admin', '/me')).toBe(false);
  });
  it('does not treat /media-like paths as crew pages', () => {
    expect(canOpen('admin', '/media')).toBe(true);
  });
  it('never redirects back into auth screens', () => {
    expect(canOpen('admin', '/login')).toBe(false);
    expect(canOpen('videographer', '/reset-password?mode=invite')).toBe(false);
  });
  it('allows shared pages for everyone', () => {
    expect(canOpen('videographer', '/')).toBe(true);
    expect(canOpen('admin', '/notifications')).toBe(true);
  });
});

describe('canOpen for reviewers', () => {
  it('lets reviewers into the review queue, tasks and calendar only', () => {
    expect(canOpen('reviewer', '/admin/review')).toBe(true);
    expect(canOpen('reviewer', '/admin/review/abc')).toBe(true);
    expect(canOpen('reviewer', '/admin/tasks/abc')).toBe(true);
    expect(canOpen('reviewer', '/admin/calendar?month=2026-10')).toBe(true);
    expect(canOpen('reviewer', '/admin/assessments')).toBe(false);
    expect(canOpen('reviewer', '/admin/settings')).toBe(false);
    expect(canOpen('reviewer', '/admin/reviewers')).toBe(false);
    expect(canOpen('reviewer', '/me')).toBe(false);
  });
});
