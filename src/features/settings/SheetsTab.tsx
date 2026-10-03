import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Link2, MoreHorizontal, RefreshCw, Settings2, Trash2, Wrench, XCircle, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { Chip } from '@/components/Chips';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { Segmented } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { UserAvatar } from '@/components/UserAvatar';
import { useCrewOptions } from '@/features/lookups/api';
import { formatDateTime, timeAgo } from '@/lib/dates';
import { env } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { sheetUrl, spreadsheetIdFrom } from '@/lib/sheets';
import { cn } from '@/lib/utils';

import {
  type SheetConfigRow,
  type SyncResult,
  useAppSettings,
  useDeleteSheetConfig,
  useIssuePingTokens,
  useRunSheets,
  useSaveSheetConfig,
  useSheetConfigs,
  useSheetInfo,
  useSyncRuns,
  useUpdateAppSettings,
} from './api';
import { appsScriptFor } from './appsScript';
import { ConnectSheetDialog } from './ConnectSheetDialog';
import { SyncEventList } from './syncEvents';

function resultToast(r: SyncResult) {
  if (r.skipped) return toast.message(r.skipped);
  const summary = `${r.actions ?? 0} change${r.actions === 1 ? '' : 's'} from sheets · ${r.rowsWritten ?? 0} row${r.rowsWritten === 1 ? '' : 's'} written`;
  if (r.status === 'ok') toast.success('Sync complete', { description: summary });
  else if (r.status === 'partial') toast.warning('Synced with some problems', { description: `${summary}. See Sync health below.` });
  else toast.error('Sync failed', { description: 'See Sync health below.' });
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Couldn’t copy — select the text and copy it manually.');
  }
}

export function SheetsTab() {
  const info = useSheetInfo();
  const settings = useAppSettings();
  const configs = useSheetConfigs();
  const crew = useCrewOptions();
  const runs = useSyncRuns(8);
  const update = useUpdateAppSettings();
  const run = useRunSheets();
  const [connect, setConnect] = useState<{ id: string; full_name: string } | null>(null);
  const [problemsOnly, setProblemsOnly] = useState<'problems' | 'all'>('problems');
  const [master, setMaster] = useState('');

  const byPerson = useMemo(() => new Map((configs.data ?? []).map((c) => [c.videographer_id, c])), [configs.data]);
  const names = useMemo(() => new Map((crew.data ?? []).map((p) => [p.id, p.full_name])), [crew.data]);
  const people = (crew.data ?? []).filter((p) => p.is_active || byPerson.has(p.id));
  const mode = settings.data?.sheet_mode ?? 'own_sheet';

  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {info.isPending ? (
            <Skeleton className="h-16" />
          ) : info.isError ? (
            <p className="text-sm text-danger-text">Couldn’t reach the sheets service: {friendlyError(info.error)}</p>
          ) : !info.data.configured ? (
            <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden />
              <div>
                <p className="font-medium text-warning-text">Google isn’t set up yet</p>
                <p className="mt-1 text-muted-foreground">
                  Add the <code className="font-mono">GOOGLE_SERVICE_ACCOUNT_JSON</code> secret to the Edge Functions (see <code className="font-mono">SHEETS_SETUP.md</code>), then reload this page.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <CheckCircle2 className="hidden h-5 w-5 shrink-0 text-success-text sm:block" aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">Service account ready</p>
                <p className="text-muted-foreground">
                  Share every sheet with <span className="select-all break-all font-mono text-foreground">{info.data.serviceAccountEmail}</span> as Editor.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void copy(info.data.serviceAccountEmail ?? '', 'Email')}>
                <Copy /> Copy email
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-3">
              <Switch
                id="sync-enabled"
                checked={settings.data?.sync_enabled ?? false}
                disabled={!settings.data || update.isPending}
                onCheckedChange={(on) =>
                  update.mutate(
                    { sync_enabled: on },
                    { onSuccess: () => toast.success(on ? 'Automatic sync on' : 'Automatic sync paused'), onError: (e) => toast.error(friendlyError(e)) },
                  )
                }
              />
              <div>
                <Label htmlFor="sync-enabled">Sync automatically</Label>
                <p className="text-xs text-muted-foreground">Every 10 minutes, and within seconds of a sheet edit once Instant sync is set up.</p>
                {info.data && !info.data.cronSecretSet && <p className="text-xs text-warning-text">SYNC_CRON_SECRET isn’t set, so the schedule can’t call the sync yet.</p>}
              </div>
            </div>
            <Button
              onClick={() => run.mutate({ action: 'sync' }, { onSuccess: resultToast, onError: (e) => toast.error(friendlyError(e)) })}
              loading={run.isPending && !run.variables?.configId}
              disabled={!info.data?.configured || (configs.data?.length ?? 0) === 0}
            >
              {!(run.isPending && !run.variables?.configId) && <RefreshCw />} Sync now
            </Button>
          </div>

          <div className="space-y-3 border-t border-border pt-5">
            <Label>Sheet layout</Label>
            <Segmented
              label="Sheet layout"
              value={mode}
              onChange={(v) => update.mutate({ sheet_mode: v }, { onError: (e) => toast.error(friendlyError(e)) })}
              options={[
                { value: 'own_sheet', label: 'One spreadsheet per person' },
                { value: 'master_tab', label: 'One tab each in a master sheet' },
              ]}
            />
            {mode === 'own_sheet' ? (
              <p className="text-xs text-muted-foreground">Recommended. Each person can only open their own spreadsheet.</p>
            ) : (
              <>
                <p className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-text">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  Google can’t hide tabs from people who can edit the file, so everyone will be able to read everyone else’s tasks. Use one spreadsheet per person if that matters.
                </p>
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const id = spreadsheetIdFrom(master);
                    if (!id) return toast.error('Paste the master spreadsheet’s link');
                    update.mutate({ master_spreadsheet_id: id }, { onSuccess: () => toast.success('Master spreadsheet saved'), onError: (err) => toast.error(friendlyError(err)) });
                  }}
                >
                  <Input
                    value={master}
                    onChange={(e) => setMaster(e.target.value)}
                    placeholder={settings.data?.master_spreadsheet_id ? `Current: …${settings.data.master_spreadsheet_id.slice(-10)}` : 'Master spreadsheet link'}
                    aria-label="Master spreadsheet link"
                  />
                  <Button type="submit" variant="secondary" loading={update.isPending}>
                    Save
                  </Button>
                </form>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Videographers</CardTitle>
          <p className="text-sm text-muted-foreground">Each person edits Status, Deliverable link and Notes in their tab. Everything else is written by CrewBoard and protected.</p>
        </CardHeader>
        <CardContent>
          {configs.isPending || crew.isPending ? (
            <Skeleton className="h-40" />
          ) : (
            <ul className="divide-y divide-border">
              {people.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  config={byPerson.get(p.id)}
                  onConnect={() => setConnect(p)}
                  canSync={Boolean(info.data?.configured)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Sync health</CardTitle>
          <Segmented
            label="Show"
            value={problemsOnly}
            onChange={setProblemsOnly}
            options={[
              { value: 'problems', label: 'Problems' },
              { value: 'all', label: 'Everything' },
            ]}
          />
        </CardHeader>
        <CardContent className="space-y-5">
          {runs.data && runs.data.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Recent runs">
              {runs.data.map((r) => {
                const s = (r.stats ?? {}) as { actions?: number; rowsWritten?: number; error?: string };
                return (
                  <span
                    key={r.id}
                    title={`${formatDateTime(r.started_at)} · ${r.trigger}${r.by?.full_name ? ` by ${r.by.full_name}` : ''} · ${s.actions ?? 0} in / ${s.rowsWritten ?? 0} out${s.error ? ` · ${s.error}` : ''}`}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset',
                      r.status === 'ok' && 'bg-success/10 text-success-text ring-success/25',
                      r.status === 'partial' && 'bg-warning/10 text-warning-text ring-warning/30',
                      r.status === 'error' && 'bg-danger/10 text-danger-text ring-danger/25',
                      r.status === 'running' && 'bg-info/10 text-info-text ring-info/25',
                    )}
                  >
                    {r.status === 'error' ? <XCircle className="h-3 w-3" aria-hidden /> : <CheckCircle2 className="h-3 w-3" aria-hidden />}
                    {timeAgo(r.started_at)} · {r.trigger}
                  </span>
                );
              })}
            </div>
          )}
          <SyncEventList problemsOnly={problemsOnly === 'problems'} names={names} />
        </CardContent>
      </Card>

      <AppsScriptCard configs={configs.data ?? []} names={names} />

      {connect && (
        <ConnectSheetDialog
          open
          onOpenChange={(o) => !o && setConnect(null)}
          person={connect}
          existing={byPerson.get(connect.id)}
          mode={mode}
          masterSpreadsheetId={settings.data?.master_spreadsheet_id ?? null}
          serviceAccountEmail={info.data?.serviceAccountEmail ?? null}
        />
      )}
    </div>
  );
}

function PersonRow({
  person: p,
  config: c,
  onConnect,
  canSync,
}: {
  person: { id: string; full_name: string; avatar_url: string | null; is_active: boolean };
  config?: SheetConfigRow;
  onConnect: () => void;
  canSync: boolean;
}) {
  const run = useRunSheets();
  const save = useSaveSheetConfig();
  const remove = useDeleteSheetConfig();
  const [confirm, setConfirm] = useState(false);

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar name={p.full_name} src={p.avatar_url} className="h-9 w-9 text-xs" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{p.full_name}</p>
          {c ? (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="truncate">Tab “{c.tab_name}”</span>
              {c.last_synced_at ? <span>· last good sync {timeAgo(c.last_synced_at)}</span> : <span>· never synced</span>}
              {!c.provisioned_at && <span className="text-warning-text">· not set up</span>}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No sheet connected</p>
          )}
          {c?.last_error && <p className="mt-0.5 line-clamp-2 text-xs text-danger-text">{c.last_error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {c && (
          <>
            {c.last_status === 'ok' && <Chip className="bg-success/12 text-success-text ring-success/25">OK</Chip>}
            {c.last_status === 'partial' && <Chip className="bg-warning/12 text-warning-text ring-warning/30">Needs a look</Chip>}
            {c.last_status === 'error' && <Chip className="bg-danger/12 text-danger-text ring-danger/25">Failing</Chip>}
            {!c.is_enabled && <Chip>Paused</Chip>}
          </>
        )}
        {c ? (
          <>
            <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${p.full_name}’s sheet`}>
              <a href={sheetUrl(c.spreadsheet_id)} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
              </a>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Sheet actions for ${p.full_name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!canSync || !c.is_enabled}
                  onSelect={() => run.mutate({ action: 'sync', configId: c.id }, { onSuccess: resultToast, onError: (e) => toast.error(friendlyError(e)) })}
                >
                  <RefreshCw /> Sync this sheet
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canSync || !c.is_enabled}
                  onSelect={() =>
                    run.mutate(
                      { action: 'provision', configId: c.id },
                      { onSuccess: (r) => (r.failed ? toast.error('Set-up failed — see Sync health') : toast.success('Sheet set up again: header, dropdown and protection')), onError: (e) => toast.error(friendlyError(e)) },
                    )
                  }
                >
                  <Wrench /> Repair header & protection
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onConnect}>
                  <Settings2 /> Change sheet or tab
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    save.mutate(
                      { ...c, is_enabled: !c.is_enabled },
                      { onSuccess: () => toast.success(c.is_enabled ? 'Sync paused for this sheet' : 'Sync resumed'), onError: (e) => toast.error(friendlyError(e)) },
                    )
                  }
                >
                  {c.is_enabled ? 'Pause sync' : 'Resume sync'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setConfirm(true)} className="text-danger-text focus:text-danger-text">
                  <Trash2 /> Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={onConnect} disabled={!p.is_active}>
            <Link2 /> Connect
          </Button>
        )}
        {run.isPending && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Syncing" />}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Disconnect ${p.full_name}’s sheet?`}
        description="CrewBoard stops reading and writing it. The spreadsheet itself isn’t touched or deleted."
        confirmLabel="Disconnect"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          c &&
          remove.mutate(c.id, {
            onSuccess: () => {
              toast.success('Sheet disconnected');
              setConfirm(false);
            },
            onError: (e) => toast.error(friendlyError(e)),
          })
        }
      />
    </li>
  );
}

function AppsScriptCard({ configs, names }: { configs: SheetConfigRow[]; names: Map<string, string> }) {
  const issue = useIssuePingTokens();
  const spreadsheets = useMemo(() => {
    const m = new Map<string, { people: string[]; ready: boolean }>();
    for (const c of configs) {
      const e = m.get(c.spreadsheet_id) ?? { people: [], ready: true };
      e.people.push(names.get(c.videographer_id) ?? c.tab_name);
      e.ready &&= Boolean(c.ping_token_hash);
      m.set(c.spreadsheet_id, e);
    }
    return [...m.entries()].map(([id, e]) => ({ id, label: e.people.sort().join(', '), ready: e.ready }));
  }, [configs, names]);
  const [chosen, setChosen] = useState<string>('');
  const [script, setScript] = useState<{ id: string; code: string } | null>(null);
  const selected = spreadsheets.find((x) => x.id === chosen) ?? spreadsheets[0];
  const syncUrl = `${env?.VITE_SUPABASE_URL ?? ''}/functions/v1/sheets`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary-text" aria-hidden /> Instant sync
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a small script into each spreadsheet once. Then, when someone marks a task <strong className="font-medium text-foreground">Completed</strong> (or changes the link or
          notes), CrewBoard updates within seconds instead of at the next 10-minute sync. It also records the exact edit time.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {spreadsheets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Connect a sheet above first.</p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {spreadsheets.length > 1 && (
                <Select value={selected?.id} onValueChange={(v) => { setChosen(v); setScript(null); }}>
                  <SelectTrigger className="sm:w-72" aria-label="Spreadsheet">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {spreadsheets.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.label}
                        {x.ready ? ' · script issued' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="secondary"
                loading={issue.isPending}
                onClick={() =>
                  selected &&
                  issue.mutate(selected.id, {
                    onSuccess: (tokens) => setScript({ id: selected.id, code: appsScriptFor(syncUrl, tokens) }),
                    onError: (e) => toast.error(friendlyError(e)),
                  })
                }
              >
                {selected?.ready ? 'Create a new script' : 'Create script'}
              </Button>
              {selected && spreadsheets.length === 1 && <span className="text-sm text-muted-foreground">for {selected.label}’s spreadsheet</span>}
            </div>
            {selected?.ready && !script && (
              <p className="text-xs text-muted-foreground">A script was already created for this spreadsheet. Creating a new one stops the old one working, so replace it in the sheet too.</p>
            )}
            {script && script.id === selected?.id && (
              <div className="space-y-3">
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>
                    Open the spreadsheet (
                    <a href={sheetUrl(script.id)} target="_blank" rel="noopener noreferrer" className="text-primary-text underline-offset-2 hover:underline">
                      open it
                    </a>
                    ) as its owner, then <strong className="font-medium">Extensions › Apps Script</strong>.
                  </li>
                  <li>Replace everything in the editor with the script below and press Save.</li>
                  <li>
                    Choose <code className="font-mono">installCrewBoard</code> next to Run, press <strong className="font-medium">Run</strong> and allow access. Done.
                  </li>
                </ol>
                <pre className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-4 font-mono text-xs leading-relaxed scrollbar-thin">{script.code}</pre>
                <Button variant="secondary" size="sm" onClick={() => void copy(script.code, 'Script')}>
                  <Copy /> Copy script
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
