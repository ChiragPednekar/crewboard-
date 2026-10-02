import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { friendlyError } from '@/lib/errors';
import { spreadsheetIdFrom } from '@/lib/sheets';

import { type SheetConfigRow, useRunSheets, useSaveSheetConfig } from './api';

interface ConnectSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: { id: string; full_name: string };
  existing?: SheetConfigRow;
  mode: 'own_sheet' | 'master_tab';
  masterSpreadsheetId: string | null;
  serviceAccountEmail: string | null;
}

/** Connect (or re-point) a videographer's sheet, then set it up straight away. */
export function ConnectSheetDialog({ open, onOpenChange, person, existing, mode, masterSpreadsheetId, serviceAccountEmail }: ConnectSheetDialogProps) {
  const save = useSaveSheetConfig();
  const run = useRunSheets();
  const first = person.full_name.split(' ')[0] ?? person.full_name;
  const [url, setUrl] = useState('');
  const [tab, setTab] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl(existing && mode === 'own_sheet' ? existing.spreadsheet_id : '');
    setTab(existing?.tab_name ?? (mode === 'master_tab' ? `${first} – Tasks` : 'Tasks'));
    setError(null);
  }, [open, existing, mode, first]);

  const busy = save.isPending || run.isPending;

  async function submit() {
    const spreadsheetId = mode === 'master_tab' ? masterSpreadsheetId : spreadsheetIdFrom(url);
    if (!spreadsheetId) {
      setError(mode === 'master_tab' ? 'Set the master spreadsheet in Google Sheets settings first.' : 'Paste the full Google Sheets link (…/spreadsheets/d/…).');
      return;
    }
    if (!tab.trim()) {
      setError('Give the tab a name.');
      return;
    }
    setError(null);
    try {
      const cfg = await save.mutateAsync({ id: existing?.id, videographer_id: person.id, spreadsheet_id: spreadsheetId, tab_name: tab });
      toast.message('Connected — setting up the sheet…');
      const res = await run.mutateAsync({ action: 'provision', configId: cfg.id });
      if (res.skipped) toast.message(res.skipped);
      else if (res.failed) toast.error('Saved, but the sheet couldn’t be set up. See Sync health for the reason (usually: not shared with the service account).');
      else toast.success(`${first}’s sheet is ready`, { description: `${res.rowsWritten ?? 0} tasks written.` });
      onOpenChange(false);
    } catch (e) {
      const msg = friendlyError(e);
      setError(/already exists/i.test(msg) ? 'Another videographer already uses that tab in this spreadsheet.' : msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Change ${first}’s sheet` : `Connect ${first}’s sheet`}</DialogTitle>
          <DialogDescription>
            {mode === 'own_sheet'
              ? `Create a Google Sheet, share it with ${first} and with the service account below (both as Editor), then paste its link.`
              : `${first} gets their own tab in the master spreadsheet.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === 'own_sheet' && (
            <div className="space-y-2">
              <Label htmlFor="sheet-url">Google Sheet link</Label>
              <Input id="sheet-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…/edit" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="sheet-tab">Tab name</Label>
            <Input id="sheet-tab" value={tab} maxLength={100} onChange={(e) => setTab(e.target.value)} />
            <p className="text-xs text-muted-foreground">Created if it doesn’t exist. Existing content outside our columns is left alone.</p>
          </div>
          {serviceAccountEmail && (
            <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground">
              Share with: <span className="select-all font-mono text-foreground">{serviceAccountEmail}</span>
            </p>
          )}
          {existing && <p className="text-xs text-warning-text">Changing the sheet or tab starts it fresh: the new tab is filled from the app.</p>}
          {error && (
            <p className="text-sm text-danger-text" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {existing ? 'Save & set up' : 'Connect & set up'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
