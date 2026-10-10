import { describe, expect, it } from 'vitest';

import { cleanDomain } from './AccessTab';

describe('company domains', () => {
  it('accepts a bare domain or a full address', () => {
    expect(cleanDomain(' SunriseStudio.in ')).toBe('sunrisestudio.in');
    expect(cleanDomain('meera@SunriseStudio.in')).toBe('sunrisestudio.in');
    expect(cleanDomain('   ')).toBe('');
  });
});
