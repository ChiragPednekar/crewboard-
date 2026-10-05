// admin-users: crew account management that needs the Auth admin API.
//
//   POST { action: 'invite', full_name, email, phone?, base_location?, client_ids? }   (also allow-lists the email)
//   POST { action: 'resend_invite', user_id }
//   POST { action: 'update_email', user_id, email }
//   POST { action: 'set_active', user_id, active }
//
// Profile edits that RLS already allows (name, phone, location) are done by the app
// directly. Writes that should be audited run with the caller's JWT, so triggers
// record the admin as the actor; only Auth admin calls use the service role.

import { requireAdmin, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, HttpError, json } from '../_shared/http.ts';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = '876000h'; // ~100 years

function str(v: unknown, field: string, { required = false, max = 200 } = {}): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (required) throw new HttpError(400, `${field} is required.`);
    return null;
  }
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be text.`);
  const s = v.trim();
  if (s.length > max) throw new HttpError(400, `${field} is too long.`);
  return s;
}

function email(v: unknown): string {
  const e = str(v, 'Email', { required: true, max: 254 })!.toLowerCase();
  if (!EMAIL_RE.test(e)) throw new HttpError(400, 'Enter a valid email address.');
  return e;
}

function userId(v: unknown): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new HttpError(400, 'Unknown user.');
  return v;
}

function authMessage(message: string | undefined): string {
  if (message && /already (been )?registered|already exists/i.test(message)) {
    return 'Someone with this email already has an account.';
  }
  if (message && /rate limit/i.test(message)) {
    return 'Too many emails sent recently. Wait a few minutes and try again.';
  }
  return message || 'The account service rejected the request.';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const caller = await requireAdmin(req);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.action !== 'string') throw new HttpError(400, 'Missing action.');
    const admin = serviceClient();

    switch (body.action) {
      case 'invite': {
        const fullName = str(body.full_name, 'Name', { required: true, max: 120 })!;
        if (fullName.length < 2) throw new HttpError(400, 'Name is too short.');
        const address = email(body.email);
        const phone = str(body.phone, 'Phone', { max: 20 });
        if (phone && !/^[0-9+() -]{6,20}$/.test(phone)) throw new HttpError(400, 'Phone number is not valid.');
        const baseLocation = str(body.base_location, 'Base location', { max: 120 });
        const clientIds = Array.isArray(body.client_ids) ? body.client_ids.filter((c) => typeof c === 'string' && UUID_RE.test(c)) : [];

        // The sign-up gate (hook_before_user_created) only lets allow-listed emails in,
        // so list the address first. Clients are assigned below as before.
        const { error: allowError } = await admin
          .from('allowed_emails')
          .upsert({ email: address, full_name: fullName, phone, base_location: baseLocation, added_by: caller.id }, { onConflict: 'email' });
        if (allowError) throw allowError;

        // Role is not passed: handle_new_user defaults to videographer, and only the
        // service role could set app_metadata.role anyway.
        const { data, error } = await admin.auth.admin.inviteUserByEmail(address, {
          // invited_by lets the audit trigger credit the admin instead of "System"
          data: { full_name: fullName, phone, base_location: baseLocation, invited_by: caller.id },
        });
        if (error || !data.user) throw new HttpError(error?.status === 422 ? 409 : 400, authMessage(error?.message));

        if (clientIds.length > 0) {
          const { error: rpcError } = await caller.db.rpc('set_videographer_clients', {
            p_videographer_id: data.user.id,
            p_client_ids: clientIds,
          });
          if (rpcError) {
            return json({ id: data.user.id, warning: 'Invite sent, but clients could not be assigned. Assign them from the profile.' });
          }
        }
        return json({ id: data.user.id });
      }

      case 'resend_invite': {
        const id = userId(body.user_id);
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (error || !data.user?.email) throw new HttpError(404, 'Unknown user.');
        if (data.user.email_confirmed_at || data.user.last_sign_in_at) {
          throw new HttpError(409, 'This person has already set up their account. They can use “Forgot password” instead.');
        }
        const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(data.user.email);
        if (inviteError) throw new HttpError(400, authMessage(inviteError.message));
        return json({ ok: true });
      }

      case 'update_email': {
        const id = userId(body.user_id);
        const address = email(body.email);
        await admin.from('allowed_emails').upsert({ email: address, added_by: caller.id, claimed_at: new Date().toISOString(), claimed_by: id }, { onConflict: 'email' });
        const { error } = await admin.auth.admin.updateUserById(id, { email: address, email_confirm: true });
        if (error) throw new HttpError(error.status === 422 ? 409 : 400, authMessage(error.message));
        return json({ ok: true });
      }

      case 'set_active': {
        const id = userId(body.user_id);
        if (typeof body.active !== 'boolean') throw new HttpError(400, 'Missing active flag.');
        if (id === caller.id) throw new HttpError(400, 'You cannot deactivate your own account.');

        // Profile first (as the admin, so it is audited), then the Auth ban.
        const { data: updated, error: profileError } = await caller.db
          .from('profiles')
          .update({ is_active: body.active })
          .eq('id', id)
          .select('id')
          .maybeSingle();
        if (profileError) throw profileError;
        if (!updated) throw new HttpError(404, 'Unknown user.');

        const { error: banError } = await admin.auth.admin.updateUserById(id, {
          ban_duration: body.active ? 'none' : BAN_FOREVER,
        });
        if (banError) {
          await caller.db.from('profiles').update({ is_active: !body.active }).eq('id', id);
          throw new HttpError(400, authMessage(banError.message));
        }
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, 'Unknown action.');
    }
  } catch (err) {
    return errorResponse(err);
  }
});
