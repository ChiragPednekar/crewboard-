// Pure helpers for notify-dispatch (no I/O, unit-tested in Vitest).

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
}

export interface RecipientProfile {
  full_name: string;
  phone: string | null;
  is_active: boolean;
  whatsapp_opt_in: boolean;
  whatsapp_number: string | null;
}

/**
 * Normalise a phone number for the WhatsApp Cloud API: digits only, with country code.
 * Bare 10-digit Indian mobile numbers get 91 in front. Returns null when unusable.
 */
export function whatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  const hadPlus = digits.startsWith('+');
  digits = digits.replace(/\D/g, '');
  if (!hadPlus && digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!hadPlus && digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function absoluteLink(appUrl: string, link: string | null): string {
  const base = appUrl.replace(/\/+$/, '');
  if (!link) return base;
  return /^https?:\/\//.test(link) ? link : `${base}${link.startsWith('/') ? '' : '/'}${link}`;
}

/** Web Push payload, read by public/sw.js. */
export function pushPayload(n: NotificationRow, appUrl: string): string {
  return JSON.stringify({
    title: n.title,
    body: n.body ?? '',
    url: absoluteLink(appUrl, n.link),
    tag: `crewboard-${n.type}`,
  });
}

/** WhatsApp text params are limited and may not contain newlines or 4+ spaces in a row. */
export function templateText(value: string, max = 900): string {
  const clean = value.replace(/\s*\n+\s*/g, ' · ').replace(/\s{4,}/g, '   ').trim();
  return (clean.length > max ? `${clean.slice(0, max - 1)}…` : clean) || '-';
}

/**
 * Body for the WhatsApp Cloud API "template" message. The approved template
 * (default name: crewboard_update) has three body variables: {{1}} title, {{2}} details, {{3}} link.
 */
export function whatsappMessage(
  to: string,
  n: NotificationRow,
  opts: { template: string; language: string; appUrl: string },
) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: opts.template,
      language: { code: opts.language },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: templateText(n.title, 300) },
            { type: 'text', text: templateText(n.body ?? '') },
            { type: 'text', text: absoluteLink(opts.appUrl, n.link) },
          ],
        },
      ],
    },
  };
}

/** Who gets a WhatsApp for this notification (opt-in + a usable number). */
export function whatsappRecipient(p: RecipientProfile): string | null {
  if (!p.is_active || !p.whatsapp_opt_in) return null;
  return whatsappNumber(p.whatsapp_number) ?? whatsappNumber(p.phone);
}
