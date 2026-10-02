import { useState } from 'react';
import { Link2, Plus, StickyNote, X } from 'lucide-react';

import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { isHttpUrl } from '@/lib/links';

import { fetchLinkMeta } from './api';
import type { RefDraft } from './schemas';

/** Link + note input with live previews. Used when creating a task and on the task page. */
export function ReferenceInput({ onAdd, busy }: { onAdd: (draft: RefDraft) => Promise<void> | void; busy?: boolean }) {
  const [mode, setMode] = useState<'link' | 'note'>('link');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  async function addLink() {
    const value = url.trim();
    if (!isHttpUrl(value)) {
      setError('Paste a full link starting with https://');
      return;
    }
    setError(null);
    setFetching(true);
    const meta = await fetchLinkMeta(value);
    setFetching(false);
    try {
      await onAdd({ kind: 'link', url: value, title: meta.title ?? '', meta: { ...meta } });
      setUrl('');
    } catch {
      /* the caller reported it; keep the link so it can be retried */
    }
  }

  async function addNote() {
    const value = note.trim();
    if (!value) {
      setError('Write the note first');
      return;
    }
    setError(null);
    try {
      await onAdd({ kind: 'note', note: value });
      setNote('');
    } catch {
      /* keep the note so it can be retried */
    }
  }

  const working = fetching || Boolean(busy);

  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="group" aria-label="Reference type">
        {(
          [
            ['link', Link2, 'Link'],
            ['note', StickyNote, 'Note'],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setError(null);
            }}
            className={
              'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ' +
              (mode === value ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:text-foreground')
            }
          >
            <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>
      {mode === 'link' ? (
        <div className="flex gap-2">
          <Input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addLink();
              }
            }}
            placeholder="https://youtu.be/… · Drive · Instagram · Vimeo"
            aria-label="Reference link"
            aria-invalid={Boolean(error) || undefined}
          />
          <Button type="button" variant="secondary" onClick={() => void addLink()} loading={working} className="shrink-0">
            {!working && <Plus />} {fetching ? 'Fetching' : 'Add'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Shot list, music cue, framing notes…"
            aria-label="Reference note"
            aria-invalid={Boolean(error) || undefined}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => void addNote()} loading={Boolean(busy)}>
            <Plus /> Add note
          </Button>
        </div>
      )}
      {error && (
        <p className="text-xs text-danger-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Pending references in the create-task form (saved together with the task). */
export function ReferenceDrafts({ value, onChange }: { value: RefDraft[]; onChange: (v: RefDraft[]) => void }) {
  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((r, i) => {
            const remove = (
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove reference">
                <X />
              </Button>
            );
            return (
              <li key={i}>
                {r.kind === 'link' ? (
                  <LinkPreviewCard url={r.url} meta={r.meta} title={r.title} actions={remove} />
                ) : (
                  <div className="flex gap-3 rounded-lg border border-border bg-surface-2/40 p-3">
                    <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden />
                    <p className="flex-1 whitespace-pre-line text-sm">{r.note}</p>
                    {remove}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ReferenceInput onAdd={(d) => onChange([...value, d])} />
    </div>
  );
}
