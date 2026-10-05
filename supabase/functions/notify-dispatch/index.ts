// notify-dispatch: delivers an in-app notification as a Web Push and/or a WhatsApp message.
//
//   POST { notification_id }   header: x-dispatch-secret (checked against Vault via check_dispatch_secret)
//   GET                        → { publicKey } (VAPID public key for the browser)
//
// Called by the notifications_dispatch trigger (pg_net). Each channel switches on when its
// secrets are set, so the app works with none, one or both:
//   Web Push:  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:… or https://…)
//   WhatsApp:  WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, optional WHATSAPP_TEMPLATE / WHATSAPP_TEMPLATE_LANG
//   Links:     APP_URL (e.g. https://crewboard-three.vercel.app)

import webpush from 'npm:web-push@3.6.7';

import { serviceClient } from '../_shared/auth.ts';
import { json } from '../_shared/http.ts';
import {
  type NotificationRow,
  pushPayload,
  type RecipientProfile,
  whatsappMessage,
  whatsappRecipient,
} from '../_shared/notify-core.ts';

const env = (k: string) => Deno.env.get(k) ?? '';


Deno.serve(async (req) => {
  // The browser needs the public VAPID key to subscribe; it is public by design.
  if (req.method === 'GET') {
    const publicKey = env('VAPID_PUBLIC_KEY');
    return json({ publicKey: publicKey || null }, 200, { 'Cache-Control': 'public, max-age=3600' });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // The secret lives only in the database (Vault); ask it rather than keeping a copy here.
  const db = serviceClient();
  const presented = req.headers.get('x-dispatch-secret') ?? '';
  const { data: ok } = await db.rpc('check_dispatch_secret', { p_secret: presented });
  if (ok !== true) return json({ error: 'Unauthorized' }, 401);

  const body = (await req.json().catch(() => null)) as { notification_id?: unknown } | null;
  const id = typeof body?.notification_id === 'string' ? body.notification_id : null;
  if (!id) return json({ error: 'Missing notification_id' }, 400);

  const { data: n, error } = await db
    .from('notifications')
    .select('id, user_id, type, title, body, link, push_sent_at, whatsapp_status')
    .eq('id', id)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!n) return json({ error: 'Not found' }, 404);
  if (n.push_sent_at || n.whatsapp_status) return json({ skipped: 'already dispatched' });

  const { data: profile } = await db
    .from('profiles')
    .select('full_name, phone, is_active, whatsapp_opt_in, whatsapp_number')
    .eq('id', n.user_id)
    .maybeSingle<RecipientProfile>();
  if (!profile?.is_active) return json({ skipped: 'inactive recipient' });

  const appUrl = env('APP_URL') || 'https://crewboard-three.vercel.app';
  const result: { push?: string; whatsapp?: string } = {};

  // --- Web Push -------------------------------------------------------------
  const vapidPublic = env('VAPID_PUBLIC_KEY');
  const vapidPrivate = env('VAPID_PRIVATE_KEY');
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails(env('VAPID_SUBJECT') || appUrl, vapidPublic, vapidPrivate);
    const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.user_id);
    let sent = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          pushPayload(n as NotificationRow, appUrl),
          { TTL: 60 * 60 * 24, urgency: 'normal' },
        );
        sent++;
        await db.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // the browser unsubscribed or the subscription expired: forget it
        if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
        else console.error('push failed', status, (err as Error).message);
      }
    }
    result.push = `${sent}/${subs?.length ?? 0}`;
  }

  // --- WhatsApp ---------------------------------------------------------------
  const waToken = env('WHATSAPP_TOKEN');
  const waPhoneId = env('WHATSAPP_PHONE_NUMBER_ID');
  const to = whatsappRecipient(profile);
  if (waToken && waPhoneId && to) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        whatsappMessage(to, n as NotificationRow, {
          template: env('WHATSAPP_TEMPLATE') || 'crewboard_update',
          language: env('WHATSAPP_TEMPLATE_LANG') || 'en',
          appUrl,
        }),
      ),
    });
    if (res.ok) {
      result.whatsapp = 'sent';
    } else {
      const detail = await res.json().catch(() => ({}));
      result.whatsapp = `error ${res.status}: ${(detail as { error?: { message?: string } }).error?.message ?? 'unknown'}`.slice(0, 200);
      console.error('whatsapp failed', result.whatsapp);
    }
  }

  await db
    .from('notifications')
    .update({
      push_sent_at: result.push && !result.push.startsWith('0/') ? new Date().toISOString() : null,
      whatsapp_status: result.whatsapp ?? null,
    })
    .eq('id', n.id);

  return json(result);
});
