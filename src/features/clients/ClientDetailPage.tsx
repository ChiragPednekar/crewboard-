import { useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Building,
  ClipboardList,
  Ellipsis,
  ImageUp,
  Mail,
  MapPin,
  Pencil,
  Phone,
  StickyNote,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { Chip, PlanStatusChip } from '@/components/Chips';
import { ClientLogo } from '@/components/ClientLogo';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MonthPicker } from '@/components/MonthPicker';
import { PageHeader } from '@/components/PageHeader';
import { StatusChip } from '@/components/StatusChip';
import { BackLink, DetailRow } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { useMonthParam } from '@/hooks/useSearchParamState';
import { formatDate, formatMonth, isOverdue } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';

import { LOGO_TYPES, useClient, useClientTaskCount, useClientWork, useDeleteClient, useSetClientActive, useUploadClientLogo } from './api';
import { ClientFormDialog } from './ClientFormDialog';
import { ManageCrewDialog } from './ManageCrewDialog';
import { clientTypeLabel } from './schemas';

export default function ClientDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const client = useClient(id);
  const taskCount = useClientTaskCount(id);
  const [month, setMonth] = useMonthParam();
  const work = useClientWork(id, month);
  const setActive = useSetClientActive();
  const remove = useDeleteClient();
  const upload = useUploadClientLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [managingCrew, setManagingCrew] = useState(false);
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);

  if (client.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-2/3" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }
  if (client.isError) return <ErrorState error={client.error} onRetry={() => void client.refetch()} />;
  if (!client.data) {
    return (
      <EmptyState
        icon={Building}
        title="Client not found"
        description="It may have been deleted."
        action={
          <Button asChild variant="secondary">
            <Link to="/admin/clients">Back to clients</Link>
          </Button>
        }
      />
    );
  }

  const c = client.data;
  const canDelete = taskCount.data === 0;

  function onLogoPicked(file: File | undefined) {
    if (!file) return;
    upload.mutate(
      { id: c.id, file },
      {
        onSuccess: () => toast.success('Logo updated'),
        onError: (e) => toast.error(friendlyError(e)),
      },
    );
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <>
      <BackLink to="/admin/clients">Clients</BackLink>
      <PageHeader
        leading={
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative shrink-0 rounded-xl"
            aria-label={c.logo_url ? 'Change logo' : 'Upload logo'}
            disabled={upload.isPending}
          >
            <ClientLogo name={c.name} src={c.logo_url} className="h-14 w-14 rounded-xl text-base" />
            <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <ImageUp className="h-5 w-5" aria-hidden />
            </span>
          </button>
        }
        title={c.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Chip>{clientTypeLabel(c.type)}</Chip>
            {c.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {c.city}
              </span>
            )}
            {!c.is_active && <Chip className="bg-warning/12 text-warning-text ring-warning/30">Archived</Chip>}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                  <ImageUp /> {c.logo_url ? 'Change logo' : 'Upload logo'}
                </DropdownMenuItem>
                {c.is_active ? (
                  <DropdownMenuItem onSelect={() => setConfirm('archive')}>
                    <Archive /> Archive client
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() =>
                      setActive.mutate(
                        { id: c.id, active: true },
                        { onSuccess: () => toast.success('Client restored'), onError: (e) => toast.error(friendlyError(e)) },
                      )
                    }
                  >
                    <ArchiveRestore /> Restore client
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!canDelete}
                  onSelect={() => setConfirm('delete')}
                  className="text-danger-text focus:text-danger-text"
                >
                  <Trash2 /> {canDelete ? 'Delete client' : 'Delete (has tasks — archive instead)'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <input ref={fileRef} type="file" accept={LOGO_TYPES.join(',')} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onLogoPicked(e.target.files?.[0])} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border">
                <DetailRow icon={MapPin} label="Address">
                  {[c.address, c.city].filter(Boolean).join(', ') || <span className="text-muted-foreground">Not set</span>}
                </DetailRow>
                <DetailRow icon={UserRound} label="Point of contact">
                  {c.contact_name ?? <span className="text-muted-foreground">Not set</span>}
                </DetailRow>
                {c.contact_phone && (
                  <DetailRow icon={Phone} label="Phone">
                    <a className="tabular hover:text-primary-text hover:underline" href={`tel:${c.contact_phone.replace(/[^0-9+]/g, '')}`}>
                      {c.contact_phone}
                    </a>
                  </DetailRow>
                )}
                {c.contact_email && (
                  <DetailRow icon={Mail} label="Email">
                    <a className="hover:text-primary-text hover:underline" href={`mailto:${c.contact_email}`}>
                      {c.contact_email}
                    </a>
                  </DetailRow>
                )}
                <DetailRow icon={StickyNote} label="Notes for the crew">
                  {c.notes ? <span className="whitespace-pre-line">{c.notes}</span> : <span className="text-muted-foreground">No notes</span>}
                </DetailRow>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-text" aria-hidden /> Crew
              </CardTitle>
              <Button variant="secondary" size="sm" onClick={() => setManagingCrew(true)}>
                Manage
              </Button>
            </CardHeader>
            <CardContent>
              {c.crew.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody is assigned yet. Assigned videographers can see this client’s details.</p>
              ) : (
                <ul className="space-y-1">
                  {c.crew.map((p) => (
                    <li key={p.id}>
                      <Link to={`/admin/videographers/${p.id}`} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                        <UserAvatar name={p.full_name} src={p.avatar_url} className="h-8 w-8 text-xs" />
                        <span className="flex-1 truncate text-sm font-medium">{p.full_name}</span>
                        {!p.is_active && <Chip>Deactivated</Chip>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary-text" aria-hidden /> Work for {formatMonth(month, 'MMMM')}
            </CardTitle>
            <MonthPicker value={month} onChange={setMonth} />
          </CardHeader>
          <CardContent>
            {work.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : work.isError ? (
              <ErrorState error={work.error} onRetry={() => void work.refetch()} />
            ) : work.data.length === 0 ? (
              <EmptyState icon={ClipboardList} title={`Nothing planned for ${formatMonth(month)}`} description="Tasks for this client appear here once they’re in someone’s plan." className="py-10" />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {work.data.map((t) => (
                  <li key={t.id}>
                    <Link to={`/admin/tasks/${t.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-surface-2/60 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {t.videographer && <UserAvatar name={t.videographer.full_name} src={t.videographer.avatar_url} className="h-5 w-5 text-[9px]" />}
                          <span className="truncate">
                            {t.videographer?.full_name} · {t.category?.name} · due {formatDate(t.due_date, 'd MMM')}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.plan?.status === 'draft' && <PlanStatusChip status="draft" />}
                        <StatusChip status={t.status} overdue={isOverdue(t.due_date, t.status)} />
                        <span className="tabular w-16 text-right text-sm text-muted-foreground">
                          {t.points_awarded ?? '–'}/{t.max_points}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <ClientFormDialog open={editing} onOpenChange={setEditing} client={c} />
      <ManageCrewDialog open={managingCrew} onOpenChange={setManagingCrew} clientId={c.id} clientName={c.name} current={c.crew.map((p) => p.id)} />
      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Archive ${c.name}?`}
        description="Archived clients are hidden from pickers for new tasks. Existing tasks and history stay as they are, and you can restore the client any time."
        confirmLabel="Archive"
        loading={setActive.isPending}
        onConfirm={() =>
          setActive.mutate(
            { id: c.id, active: false },
            {
              onSuccess: () => {
                toast.success('Client archived');
                setConfirm(null);
              },
              onError: (e) => toast.error(friendlyError(e)),
            },
          )
        }
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${c.name}?`}
        description="This removes the client, its logo and crew assignments. It can’t be undone."
        confirmLabel="Delete client"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(c, {
            onSuccess: () => {
              toast.success('Client deleted');
              navigate('/admin/clients', { replace: true });
            },
            onError: (e) => toast.error(friendlyError(e)),
          })
        }
      />
    </>
  );
}
