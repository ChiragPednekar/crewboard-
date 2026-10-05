import { useState } from 'react';
import { Camera, History, LogIn, LogOut, MoreHorizontal, Pencil, Plus, Wrench } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput, Segmented } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCrewOptions } from '@/features/lookups/api';
import { formatDate, formatDateTime, shiftDay, todayKey } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';

import {
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_STATUS_LABEL,
  type EquipmentCategory,
  type EquipmentRow,
  type EquipmentStatus,
  useCheckout,
  useEquipment,
  useEquipmentLog,
  useReturnEquipment,
  useSaveEquipment,
  useSetEquipmentStatus,
} from './api';

const STATUS_STYLE: Record<EquipmentStatus, string> = {
  available: 'bg-success/12 text-success-text ring-success/25',
  checked_out: 'bg-violet/12 text-violet-text ring-violet/25',
  maintenance: 'bg-warning/12 text-warning-text ring-warning/30',
  retired: 'bg-muted-foreground/10 text-muted-foreground ring-border',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ring-1 ring-inset', STATUS_STYLE[status as EquipmentStatus])}>
      {EQUIPMENT_STATUS_LABEL[status as EquipmentStatus]}
    </span>
  );
}

function overdue(e: EquipmentRow) {
  return e.status === 'checked_out' && e.due_back !== null && e.due_back < todayKey();
}

/** /admin/equipment */
export function EquipmentPage() {
  const list = useEquipment();
  const [filter, setFilter] = useState<'all' | 'out' | 'available'>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<EquipmentRow | 'new' | null>(null);
  const [checkingOut, setCheckingOut] = useState<EquipmentRow | null>(null);
  const [history, setHistory] = useState<EquipmentRow | null>(null);
  const ret = useReturnEquipment();
  const setStatus = useSetEquipmentStatus();

  const items = (list.data ?? []).filter(
    (e) =>
      (filter === 'all' || (filter === 'out' ? e.status === 'checked_out' : e.status === 'available')) &&
      (!q || `${e.name} ${e.serial_no ?? ''} ${e.holder?.full_name ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  );
  const outCount = (list.data ?? []).filter((e) => e.status === 'checked_out').length;
  const lateCount = (list.data ?? []).filter(overdue).length;

  const act = (p: Promise<unknown>, msg: string) =>
    p.then(() => toast.success(msg)).catch((e: unknown) => toast.error(friendlyError(e)));

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Equipment"
        description={
          list.data
            ? `${list.data.length} items · ${outCount} out with the crew${lateCount ? ` · ${lateCount} overdue` : ''}`
            : 'Cameras, lenses, audio and lights — who has what.'
        }
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add item
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'out', label: 'Checked out', count: outCount },
            { value: 'available', label: 'Available' },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search gear or person" />
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Camera}
          title={list.data.length === 0 ? 'No equipment yet' : 'Nothing matches'}
          description={list.data.length === 0 ? 'Add your cameras, lenses and audio kits to track who has them.' : 'Try another filter.'}
          action={list.data.length === 0 ? <Button onClick={() => setEditing('new')}><Plus /> Add the first item</Button> : undefined}
        />
      ) : (
        <Card className="divide-y divide-border/70">
          {items.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-primary-text">
                <Camera className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{e.name}</p>
                <p className="text-sm text-muted-foreground">
                  {EQUIPMENT_CATEGORY_LABEL[e.category as EquipmentCategory]}
                  {e.serial_no ? ` · S/N ${e.serial_no}` : ''}
                </p>
              </div>
              {e.holder && (
                <div className="flex items-center gap-2 text-sm">
                  <UserAvatar name={e.holder.full_name} src={e.holder.avatar_url} className="h-7 w-7 text-[10px]" />
                  <span>
                    {e.holder.full_name}
                    {e.due_back && (
                      <span className={cn('block text-xs', overdue(e) ? 'font-medium text-danger-text' : 'text-muted-foreground')}>
                        {overdue(e) ? 'Overdue since ' : 'Back by '}
                        {formatDate(e.due_back, 'd MMM')}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <StatusPill status={e.status} />
              {e.status === 'available' ? (
                <Button size="sm" variant="secondary" onClick={() => setCheckingOut(e)}>
                  <LogOut /> Check out
                </Button>
              ) : e.status === 'checked_out' ? (
                <Button size="sm" variant="secondary" loading={ret.isPending && ret.variables?.id === e.id} onClick={() => act(ret.mutateAsync({ id: e.id }), `${e.name} is back`)}>
                  <LogIn /> Check in
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${e.name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(e)}>
                    <Pencil /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setHistory(e)}>
                    <History /> History
                  </DropdownMenuItem>
                  {e.status !== 'checked_out' && (
                    <>
                      <DropdownMenuSeparator />
                      {e.status !== 'maintenance' && (
                        <DropdownMenuItem onSelect={() => act(setStatus.mutateAsync({ id: e.id, status: 'maintenance' }), 'Marked as in repair')}>
                          <Wrench /> Mark in repair
                        </DropdownMenuItem>
                      )}
                      {e.status !== 'available' && (
                        <DropdownMenuItem onSelect={() => act(setStatus.mutateAsync({ id: e.id, status: 'available' }), 'Available again')}>
                          <LogIn /> Mark available
                        </DropdownMenuItem>
                      )}
                      {e.status !== 'retired' && (
                        <DropdownMenuItem onSelect={() => act(setStatus.mutateAsync({ id: e.id, status: 'retired' }), 'Retired')}>
                          Retire
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </Card>
      )}

      {editing && <EquipmentDialog item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {checkingOut && <CheckoutDialog item={checkingOut} onClose={() => setCheckingOut(null)} />}
      {history && <HistoryDialog item={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function EquipmentDialog({ item, onClose }: { item: EquipmentRow | null; onClose: () => void }) {
  const save = useSaveEquipment();
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<EquipmentCategory>((item?.category as EquipmentCategory) ?? 'camera');
  const [serial, setSerial] = useState(item?.serial_no ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [touched, setTouched] = useState(false);
  const nameError = name.trim().length < 2 ? 'Give it a name, e.g. “Sony FX3 #2”' : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Edit item' : 'Add equipment'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            setTouched(true);
            if (nameError) return;
            save.mutate(
              { id: item?.id, name, category, serial_no: serial, notes },
              {
                onSuccess: () => {
                  toast.success(item ? 'Saved' : 'Added');
                  onClose();
                },
                onError: (e) => toast.error(friendlyError(e)),
              },
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="eq-name">Name</Label>
            <Input id="eq-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-invalid={(touched && Boolean(nameError)) || undefined} />
            {touched && nameError && <p className="text-sm text-danger-text">{nameError}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as EquipmentCategory)}>
                <SelectTrigger aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EQUIPMENT_CATEGORY_LABEL) as EquipmentCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {EQUIPMENT_CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-serial">Serial number</Label>
              <Input id="eq-serial" value={serial} onChange={(e) => setSerial(e.target.value)} maxLength={80} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eq-notes">Notes</Label>
            <Textarea id="eq-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Kit contents, condition…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {item ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CheckoutDialog({ item, onClose }: { item: EquipmentRow; onClose: () => void }) {
  const crew = useCrewOptions();
  const checkout = useCheckout();
  const [who, setWho] = useState('');
  const [due, setDue] = useState(shiftDay(todayKey(), 7));
  const [note, setNote] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check out {item.name}</DialogTitle>
          <DialogDescription>They’ll get a notification and see it under My gear.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Who is taking it?</Label>
            <Select value={who} onValueChange={setWho}>
              <SelectTrigger aria-label="Crew member">
                <SelectValue placeholder="Pick a videographer" />
              </SelectTrigger>
              <SelectContent>
                {(crew.data ?? []).filter((c) => c.is_active).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-due">Due back</Label>
            <Input id="co-due" type="date" min={todayKey()} value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-note">Note</Label>
            <Input id="co-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. with 2 batteries and the 64GB card" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!who}
            loading={checkout.isPending}
            onClick={() =>
              checkout.mutate(
                { id: item.id, videographerId: who, dueBack: due, note },
                {
                  onSuccess: () => {
                    toast.success(`${item.name} checked out`);
                    onClose();
                  },
                  onError: (e) => toast.error(friendlyError(e)),
                },
              )
            }
          >
            <LogOut /> Check out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACTION_LABEL: Record<string, string> = {
  check_out: 'Checked out',
  return: 'Checked in',
  maintenance: 'Sent for repair',
  available: 'Marked available',
  retired: 'Retired',
  created: 'Added',
};

function HistoryDialog({ item, onClose }: { item: EquipmentRow; onClose: () => void }) {
  const log = useEquipmentLog(item.id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.name}: history</DialogTitle>
        </DialogHeader>
        {log.isPending ? (
          <Skeleton className="h-24" />
        ) : (log.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements yet.</p>
        ) : (
          <ol className="max-h-80 space-y-3 overflow-y-auto">
            {log.data!.map((l) => (
              <li key={l.id} className="text-sm">
                <p className="font-medium">
                  {ACTION_LABEL[l.action] ?? l.action}
                  {l.videographer ? ` · ${l.videographer.full_name}` : ''}
                </p>
                {l.note && <p className="text-muted-foreground">{l.note}</p>}
                <p className="text-xs text-muted-foreground">{formatDateTime(l.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** /me/gear — what the studio has handed you. */
export function MyGearPage() {
  const { profile } = useAuth();
  const list = useEquipment();
  const mine = (list.data ?? []).filter((e) => e.holder_id === profile?.id);
  return (
    <>
      <PageHeader title="My gear" description="Equipment checked out to you. Ask your admin to check items back in when you return them." />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : mine.length === 0 ? (
        <EmptyState icon={Camera} title="Nothing checked out to you" description="When the studio hands you a camera or kit, it shows up here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {mine.map((e) => (
            <Card key={e.id} className="p-4">
              <p className="font-display text-lg font-semibold">{e.name}</p>
              <p className="text-sm text-muted-foreground">
                {EQUIPMENT_CATEGORY_LABEL[e.category as EquipmentCategory]}
                {e.serial_no ? ` · S/N ${e.serial_no}` : ''}
              </p>
              {e.due_back && (
                <p className={cn('mt-3 text-sm', overdue(e) ? 'font-medium text-danger-text' : 'text-foreground')}>
                  {overdue(e) ? 'Overdue — was due ' : 'Return by '}
                  {formatDate(e.due_back, 'EEE d MMM')}
                </p>
              )}
              {e.notes && <p className="mt-2 text-sm text-muted-foreground">{e.notes}</p>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
