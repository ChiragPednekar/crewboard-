// sheets: Google Sheets two-way sync.
//   POST { action: 'info' }                         admin → setup status + service-account email
//   POST { action: 'provision', config_id }         admin → set up the tab, then sync it
//   POST { action: 'sync', config_id? }             admin (JWT) or pg_cron (x-sync-secret header)
//   POST { action: 'ping', token }                  Apps Script on a sheet edit → sync that tab now
//
// Env: GOOGLE_SERVICE_ACCOUNT_JSON, SYNC_CRON_SECRET, optional GOOGLE_SHEETS_API_BASE (testing).
// All writes to tasks go through the same RPCs the app uses, with source = 'sheet'.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { requireAdmin, serviceClient } from '../_shared/auth.ts';
import { getAccessToken, GoogleSheets, parseServiceAccount, SheetsError } from '../_shared/google.ts';
import { corsHeaders, errorResponse, HttpError, json } from '../_shared/http.ts';
import type { AppAction, RowState, SyncEvent, TaskSnapshot } from '../_shared/sync-core.ts';
import { type ConfigStats, provisionSheet, type SheetConfig, type SyncDb, syncSheet } from '../_shared/sync-runner.ts';

const SA = parseServiceAccount(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON'));
const CRON_SECRET = Deno.env.get('SYNC_CRON_SECRET') ?? '';
const API_BASE = Deno.env.get('GOOGLE_SHEETS_API_BASE') || undefined;

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

class SupabaseSyncDb implements SyncDb {
  constructor(
    private db: SupabaseClient,
    private runId: string,
  ) {}

  async loadSnapshots(videographerId: string): Promise<TaskSnapshot[]> {
    const { data, error } = await this.db.rpc('sheet_task_snapshots', { p_videographer_id: videographerId });
    if (error) throw error;
    return (data as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      month: r.month as string,
      client: r.client as string,
      title: r.title as string,
      category: r.category as string,
      brief: (r.brief as string | null) ?? null,
      references: (r.refs as string[]) ?? [],
      dueDate: r.due_date as string,
      status: r.status as TaskSnapshot['status'],
      statusChangedAt: r.status_changed_at as string,
      maxPoints: r.max_points as number,
      pointsAwarded: (r.points_awarded as number | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      latestLinks: (r.latest_links as string[]) ?? [],
      feedback: (r.feedback as string | null) ?? null,
      updatedAt: r.updated_at as string,
    }));
  }

  async loadRowStates(configId: string): Promise<RowState[]> {
    const { data, error } = await this.db.from('sheet_row_state').select('*').eq('sheet_config_id', configId);
    if (error) throw error;
    return data.map((s) => ({
      taskId: s.task_id,
      lastStatus: s.last_status,
      lastLink: s.last_link,
      lastNotes: s.last_notes,
      lastSheetEditAt: s.last_sheet_edit_at,
      lastWrittenAt: s.last_written_at,
    }));
  }

  async loadPending(taskIds: string[]): Promise<Set<string>> {
    if (taskIds.length === 0) return new Set();
    const { data, error } = await this.db.from('sheet_outbox').select('task_id').is('processed_at', null).in('task_id', taskIds);
    if (error) throw error;
    return new Set(data.map((r) => r.task_id as string));
  }

  async apply(a: AppAction): Promise<void> {
    const call =
      a.type === 'submit'
        ? this.db.rpc('submit_task', { p_task_id: a.taskId, p_links: a.links, p_notes: a.notes, p_source: 'sheet', p_submitted_at: a.submittedAt })
        : a.type === 'progress'
          ? this.db.rpc('set_task_progress', { p_task_id: a.taskId, p_status: a.status, p_source: 'sheet' })
          : this.db.rpc('update_task_notes', { p_task_id: a.taskId, p_notes: a.notes ?? '', p_source: 'sheet' });
    const { error } = await call;
    if (error) throw new Error(error.message);
  }

  async saveRowStates(configId: string, states: (RowState & { lastReadAt: string })[]): Promise<void> {
    const { error } = await this.db.from('sheet_row_state').upsert(
      states.map((s) => ({
        task_id: s.taskId,
        sheet_config_id: configId,
        last_status: s.lastStatus,
        last_link: s.lastLink,
        last_notes: s.lastNotes,
        last_sheet_edit_at: s.lastSheetEditAt,
        last_written_at: s.lastWrittenAt,
        last_read_at: s.lastReadAt,
      })),
    );
    if (error) throw error;
  }

  async markOutboxProcessed(taskIds: string[], cutoffIso: string): Promise<void> {
    const { error } = await this.db
      .from('sheet_outbox')
      .update({ processed_at: new Date().toISOString() })
      .in('task_id', taskIds)
      .is('processed_at', null)
      .lte('enqueued_at', cutoffIso);
    if (error) throw error;
  }

  async recordEvents(configId: string, events: SyncEvent[]): Promise<void> {
    if (events.length === 0) return;
    const { error } = await this.db.from('sync_events').insert(
      events.map((e) => ({ run_id: this.runId, sheet_config_id: configId, task_id: e.taskId ?? null, row_number: e.rowNumber ?? null, kind: e.kind, detail: e.detail })),
    );
    if (error) console.error('recordEvents', error);
  }
}

async function loadConfigs(db: SupabaseClient, configId?: string): Promise<SheetConfig[]> {
  let q = db.from('sheet_configs').select('id, videographer_id, spreadsheet_id, tab_name, is_enabled, profiles!sheet_configs_videographer_id_fkey(is_active)').eq('is_enabled', true);
  if (configId) q = q.eq('id', configId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as { id: string; videographer_id: string; spreadsheet_id: string; tab_name: string; profiles: { is_active: boolean } | null }[])
    .filter((c) => c.profiles?.is_active !== false)
    .map((c) => ({ id: c.id, videographerId: c.videographer_id, spreadsheetId: c.spreadsheet_id, tabName: c.tab_name }));
}

async function runSync(opts: { trigger: 'cron' | 'manual' | 'sheet'; by: string | null; configId?: string; provision?: boolean }) {
  if (!SA) throw new HttpError(503, 'Google Sheets isn’t set up yet: GOOGLE_SERVICE_ACCOUNT_JSON is missing.');
  const db = serviceClient();

  const { data: runId, error: runErr } = await db.rpc('begin_sync_run', { p_trigger: opts.trigger, p_triggered_by: opts.by });
  if (runErr) throw runErr;
  if (!runId) return { skipped: 'A sync is already running. Try again in a minute.' };

  const totals: ConfigStats & { sheets: number; failed: number } = { sheets: 0, failed: 0, rowsRead: 0, actions: 0, rowsWritten: 0, errors: 0, events: {} };
  const syncDb = new SupabaseSyncDb(db, runId as string);
  let startedAt = new Date().toISOString();
  let status: 'ok' | 'partial' | 'error' = 'ok';

  try {
    const sheets = new GoogleSheets(await getAccessToken(SA), API_BASE);
    const configs = await loadConfigs(db, opts.configId);
    if (opts.configId && configs.length === 0) throw new HttpError(404, 'That sheet connection is switched off or its videographer is deactivated.');

    const syncOne = async (config: SheetConfig) => {
      totals.sheets += 1;
      try {
        if (opts.provision) {
          // Only the service account may edit protected cells; the spreadsheet owner always can.
          await provisionSheet(sheets, config, [SA.client_email]);
          await db.from('sheet_configs').update({ provisioned_at: new Date().toISOString() }).eq('id', config.id);
        }
        const s = await syncSheet({ sheets, db: syncDb, config });
        totals.rowsRead += s.rowsRead;
        totals.actions += s.actions;
        totals.rowsWritten += s.rowsWritten;
        totals.errors += s.errors;
        for (const [k, v] of Object.entries(s.events)) totals.events[k] = (totals.events[k] ?? 0) + v;
        const issues = s.errors + (s.events.bad_link ?? 0) + (s.events.invalid_status ?? 0) + (s.events.unknown_id ?? 0) + (s.events.missing_id ?? 0);
        await db
          .from('sheet_configs')
          .update({ last_synced_at: new Date().toISOString(), last_status: issues ? 'partial' : 'ok', last_error: null, last_rows_updated: s.actions + s.rowsWritten })
          .eq('id', config.id);
        if (issues && status === 'ok') status = 'partial';
      } catch (e) {
        totals.failed += 1;
        status = 'partial';
        const permission = e instanceof SheetsError && e.isPermission;
        await syncDb.recordEvents(config.id, [{ kind: permission ? 'permission_denied' : 'error', detail: { message: (e as Error).message.slice(0, 500) } }]);
        // last_synced_at only moves on success, so "synced 2 h ago" stays honest while failing
        await db.from('sheet_configs').update({ last_status: 'error', last_error: (e as Error).message.slice(0, 500) }).eq('id', config.id);
      }
    };

    for (const config of configs) await syncOne(config);

    // Sheets edited while this run was busy asked for a sync (instant-sync pings): do them now
    // rather than leaving them for the next 10-minute run.
    for (let round = 0; round < 3; round++) {
      const { data: asked } = await db.from('sheet_configs').select('id').eq('is_enabled', true).gt('sync_requested_at', startedAt);
      if (!asked?.length) break;
      startedAt = new Date().toISOString();
      for (const config of await loadConfigs(db)) if (asked.some((a) => a.id === config.id)) await syncOne(config);
    }
    if (totals.sheets > 0 && totals.failed === totals.sheets) status = 'error';
  } catch (e) {
    status = 'error';
    await db.rpc('finish_sync_run', { p_run_id: runId, p_status: status, p_stats: { ...totals, error: (e as Error).message.slice(0, 500) } });
    throw e;
  }
  await db.rpc('finish_sync_run', { p_run_id: runId, p_status: status, p_stats: totals });
  return { runId, status, ...totals };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A sheet was edited: sync just that tab. Waits briefly if another run is busy (that run also picks the request up). */
async function handlePing(token: unknown) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw new HttpError(401, 'Bad sheet token');
  const db = serviceClient();
  const { data: config, error } = await db.from('sheet_configs').select('id, is_enabled').eq('ping_token_hash', await sha256Hex(token)).maybeSingle();
  if (error) throw error;
  if (!config) throw new HttpError(401, 'This script’s token was replaced. Copy the script again from CrewBoard › Settings › Google Sheets.');
  if (!config.is_enabled) return { skipped: 'Sync is paused for this sheet.' };
  const { data: settings } = await db.from('app_settings').select('sync_enabled').maybeSingle();
  if (!settings?.sync_enabled) return { skipped: 'Automatic sync is switched off in Settings.' };

  await db.from('sheet_configs').update({ sync_requested_at: new Date().toISOString() }).eq('id', config.id);
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await runSync({ trigger: 'sheet', by: null, configId: config.id });
    if (!('skipped' in result)) return result;
    await sleep(3000);
  }
  return { queued: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as { action?: string; config_id?: string; token?: unknown };

    // Apps Script on a sheet: authorised by that tab's own token, can only sync that tab
    if (body.action === 'ping') return json(await handlePing(body.token));
    const secret = req.headers.get('x-sync-secret');

    // pg_cron: shared secret, sync only
    if (secret !== null) {
      if (!CRON_SECRET || !timingSafeEqual(secret, CRON_SECRET)) throw new HttpError(401, 'Bad sync secret');
      return json(await runSync({ trigger: 'cron', by: null }));
    }

    const admin = await requireAdmin(req);
    switch (body.action) {
      case 'info': {
        const { data: settings } = await admin.db.from('app_settings').select('sync_enabled').maybeSingle();
        return json({
          configured: Boolean(SA),
          serviceAccountEmail: SA?.client_email ?? null,
          cronSecretSet: Boolean(CRON_SECRET),
          syncEnabled: settings?.sync_enabled ?? false,
        });
      }
      case 'provision':
        if (typeof body.config_id !== 'string') throw new HttpError(400, 'Missing config_id');
        return json(await runSync({ trigger: 'manual', by: admin.id, configId: body.config_id, provision: true }));
      case 'sync':
        return json(await runSync({ trigger: 'manual', by: admin.id, configId: typeof body.config_id === 'string' ? body.config_id : undefined }));
      default:
        throw new HttpError(400, 'Unknown action');
    }
  } catch (err) {
    return errorResponse(err);
  }
});
