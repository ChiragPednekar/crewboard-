import { describe, expect, it } from 'vitest';

import { friendlyError } from './errors';

describe('friendlyError', () => {
  it('passes our own RPC messages through', () => {
    expect(friendlyError({ code: '55000', message: 'The October 2026 assessment is locked' })).toBe('The October 2026 assessment is locked');
    expect(friendlyError({ code: '22023', message: 'Add at least one deliverable link' })).toBe('Add at least one deliverable link');
  });

  it('hides raw constraint names behind a plain message', () => {
    expect(friendlyError({ code: '23514', message: 'new row violates check constraint "tasks_points_within_max"' })).toBe(
      'Some values are not valid. Check the form and try again.',
    );
  });

  it('maps permission and duplicate errors', () => {
    expect(friendlyError({ code: '42501', message: 'new row violates row-level security policy' })).toBe("You don't have permission to do that.");
    expect(friendlyError({ code: '23505', message: 'duplicate key' })).toBe('That already exists.');
    expect(friendlyError({ code: '23503', message: 'fk' })).toMatch(/still in use/);
  });

  it('explains auth and network problems', () => {
    expect(friendlyError({ message: 'Invalid login credentials' })).toBe('Email or password is incorrect.');
    expect(friendlyError({ message: 'User is banned' })).toMatch(/deactivated/);
    expect(friendlyError(Object.assign(new TypeError('Failed to fetch')))).toMatch(/Can't reach the server/);
  });

  it('copes with empty and string errors', () => {
    expect(friendlyError(null)).toBe('Something went wrong.');
    expect(friendlyError('Plain text')).toBe('Plain text');
  });
  it('never shows raw database errors that could name tables or columns', () => {
    expect(friendlyError({ code: '42703', message: 'column profiles.secret does not exist' })).toBe('Something went wrong. Please try again.');
  });
});
