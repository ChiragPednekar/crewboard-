import { useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Loader2, Paperclip, StickyNote, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { friendlyError } from '@/lib/errors';
import type { TaskReference } from '@/lib/supabase';

import { REF_FILE_TYPES, useAddReference, useDeleteReference, useFileUrl, useTaskReferences, useUploadReference } from './api';
import { ReferenceInput } from './ReferenceDrafts';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ReferencesCard({ taskId, editable }: { taskId: string; editable: boolean }) {
  const refs = useTaskReferences(taskId);
  const add = useAddReference(taskId);
  const upload = useUploadReference(taskId);
  const remove = useDeleteReference(taskId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmRemove, setConfirmRemove] = useState<TaskReference | null>(null);

  function removeButton(r: TaskReference) {
    if (!editable) return null;
    return (
      <Button variant="ghost" size="icon-sm" onClick={() => setConfirmRemove(r)} aria-label={`Remove ${r.title ?? r.kind}`}>
        <Trash2 />
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary-text" aria-hidden /> References
          {refs.data && refs.data.length > 0 && <span className="tabular text-sm font-normal text-muted-foreground">{refs.data.length}</span>}
        </CardTitle>
        {editable && (
          <>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={upload.isPending}>
              {!upload.isPending && <Upload />} Upload file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={REF_FILE_TYPES.join(',')}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  upload.mutate(file, {
                    onSuccess: () => toast.success(`${file.name} uploaded`),
                    onError: (err) => toast.error(friendlyError(err)),
                  });
                }
                e.target.value = '';
              }}
            />
          </>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {refs.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        ) : refs.isError ? (
          <p className="text-sm text-danger-text">Couldn’t load references.</p>
        ) : refs.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {editable ? 'No references yet. Add example videos, mood boards, call sheets or notes.' : 'No references for this task.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {refs.data.map((r) => (
              <li key={r.id}>
                {r.kind === 'link' && r.url ? (
                  <LinkPreviewCard url={r.url} meta={r.meta} title={r.title} actions={removeButton(r)} />
                ) : r.kind === 'file' ? (
                  <FileReference reference={r} actions={removeButton(r)} />
                ) : (
                  <div className="flex gap-3 rounded-lg border border-border bg-surface-2/40 p-3">
                    <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden />
                    <p className="flex-1 whitespace-pre-line text-sm">{r.note}</p>
                    {removeButton(r)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <div className="rounded-lg border border-dashed border-border p-3">
            <ReferenceInput
              busy={add.isPending}
              onAdd={async (draft) => {
                try {
                  await add.mutateAsync(draft);
                  toast.success(draft.kind === 'link' ? 'Link added' : 'Note added');
                } catch (err) {
                  toast.error(friendlyError(err));
                  throw err; // keep the typed value so it can be retried
                }
              }}
            />
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
        title="Remove this reference?"
        description={confirmRemove?.kind === 'file' ? 'The uploaded file is deleted too.' : 'You can add it again later.'}
        confirmLabel="Remove"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          confirmRemove &&
          remove.mutate(confirmRemove, {
            onSuccess: () => {
              toast.success('Reference removed');
              setConfirmRemove(null);
            },
            onError: (e) => toast.error(friendlyError(e)),
          })
        }
      />
    </Card>
  );
}

function FileReference({ reference: r, actions }: { reference: TaskReference; actions: React.ReactNode }) {
  const meta = (r.meta ?? {}) as { size?: number; type?: string };
  const isImage = Boolean(meta.type?.startsWith('image/'));
  const url = useFileUrl(r.storage_path, isImage);
  const [opening, setOpening] = useState(false);
  const Icon = isImage ? ImageIcon : FileText;

  async function open() {
    // open the tab synchronously (popup blockers), then point it at the signed URL
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setOpening(true);
    try {
      const href = url.data ?? (await url.refetch()).data;
      if (href && tab) tab.location.href = href;
      else {
        tab?.close();
        toast.error('Couldn’t open the file.');
      }
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex gap-3 rounded-lg border border-border bg-surface-2/40 p-2">
      <button
        type="button"
        onClick={() => void open()}
        className="relative grid aspect-video w-28 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-2 text-muted-foreground sm:w-36"
        aria-label={`Open ${r.title ?? 'file'}`}
      >
        {isImage && url.data ? <img src={url.data} alt="" className="h-full w-full object-cover" /> : <Icon className="h-6 w-6" aria-hidden />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="truncate text-sm font-medium">{r.title ?? 'File'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {[meta.type?.split('/')[1]?.toUpperCase(), meta.size ? formatBytes(meta.size) : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex shrink-0 items-start gap-1">
        <Button variant="ghost" size="icon-sm" onClick={() => void open()} aria-label={`Download ${r.title ?? 'file'}`} disabled={opening}>
          {opening ? <Loader2 className="animate-spin" /> : <Download />}
        </Button>
        {actions}
      </div>
    </div>
  );
}
