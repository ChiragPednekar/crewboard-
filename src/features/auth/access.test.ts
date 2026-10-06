import { describe, expect, it } from 'vitest';

import { accessFromToken } from './AuthProvider';
import { canOpen } from './guards';

const token = (claims: object) => `h.${btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.s`;

describe('accessFromToken', () => {
  it('reads the approval status stamped by the access token hook', () => {
    expect(accessFromToken(token({ role: 'anon', crewboard_access: 'pending' }))).toBe('pending');
    expect(accessFromToken(token({ role: 'anon', crewboard_access: 'declined' }))).toBe('declined');
    expect(accessFromToken(token({ role: 'authenticated', crewboard_access: 'approved' }))).toBe('approved');
  });

  it('treats tokens without the claim (older sessions) and garbage as approved', () => {
    expect(accessFromToken(token({ role: 'authenticated' }))).toBe('approved');
    expect(accessFromToken('not-a-jwt')).toBe('approved');
    expect(accessFromToken(undefined)).toBe('approved');
  });
});

describe('sign-up page', () => {
  it('is never a place to send a signed-in user back to', () => {
    expect(canOpen('videographer', '/signup')).toBe(false);
    expect(canOpen('admin', '/signup?x=1')).toBe(false);
  });
});
