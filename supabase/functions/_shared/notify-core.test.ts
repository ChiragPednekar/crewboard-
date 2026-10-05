import { describe, expect, it } from 'vitest';

import { absoluteLink, pushPayload, templateText, whatsappMessage, whatsappNumber, whatsappRecipient } from './notify-core';

describe('whatsappNumber', () => {
  it('adds India\'s country code to bare 10-digit mobiles', () => {
    expect(whatsappNumber('98200 11001')).toBe('919820011001');
    expect(whatsappNumber('09820011001')).toBe('919820011001');
  });
  it('keeps numbers that already have a country code', () => {
    expect(whatsappNumber('+91 98200 11001')).toBe('919820011001');
    expect(whatsappNumber('+1 (415) 555-0100')).toBe('14155550100');
  });
  it('rejects junk', () => {
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappNumber('')).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });
});

describe('links and text', () => {
  it('makes app links absolute', () => {
    expect(absoluteLink('https://crew.app/', '/me/tasks/1')).toBe('https://crew.app/me/tasks/1');
    expect(absoluteLink('https://crew.app', null)).toBe('https://crew.app');
    expect(absoluteLink('https://crew.app', 'https://other.example/x')).toBe('https://other.example/x');
  });
  it('flattens newlines for WhatsApp template params', () => {
    expect(templateText('Line one\n\nLine two')).toBe('Line one · Line two');
    expect(templateText('')).toBe('-');
    expect(templateText('x'.repeat(10), 5)).toBe('xxxx…');
  });
});

describe('payloads', () => {
  const n = { id: '1', type: 'task_approved', title: 'Approved: Reel', body: '9 / 10 pts', link: '/me/tasks/1' };
  it('builds the push payload the service worker expects', () => {
    expect(JSON.parse(pushPayload(n, 'https://crew.app'))).toEqual({
      title: 'Approved: Reel',
      body: '9 / 10 pts',
      url: 'https://crew.app/me/tasks/1',
      tag: 'crewboard-task_approved',
    });
  });
  it('builds a WhatsApp template message with title, details and link', () => {
    const msg = whatsappMessage('919820011001', n, { template: 'crewboard_update', language: 'en', appUrl: 'https://crew.app' });
    expect(msg.template.components[0]?.parameters.map((p) => p.text)).toEqual([
      'Approved: Reel',
      '9 / 10 pts',
      'https://crew.app/me/tasks/1',
    ]);
  });
  it('only messages people who opted in', () => {
    const base = { full_name: 'A', phone: '9820011001', is_active: true, whatsapp_number: null };
    expect(whatsappRecipient({ ...base, whatsapp_opt_in: false })).toBeNull();
    expect(whatsappRecipient({ ...base, whatsapp_opt_in: true })).toBe('919820011001');
    expect(whatsappRecipient({ ...base, whatsapp_opt_in: true, is_active: false })).toBeNull();
  });
});
