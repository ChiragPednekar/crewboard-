import { useId, useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface CheckListOption {
  value: string;
  label: string;
  hint?: string;
  leading?: ReactNode;
  disabled?: boolean;
}

interface CheckListProps {
  options: CheckListOption[];
  value: string[];
  onChange: (value: string[]) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  /** Accessible name for the group */
  label: string;
}

/** Searchable checkbox list for picking several clients or crew members. */
export function CheckList({ options, value, onChange, searchPlaceholder = 'Search…', emptyText = 'Nothing to pick yet.', className, label }: CheckListProps) {
  const [query, setQuery] = useState('');
  const id = useId();
  const selected = useMemo(() => new Set(value), [value]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function toggle(v: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(v);
    else next.delete(v);
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
  }

  return (
    <div className={cn('rounded-lg border border-border', className)}>
      {options.length > 6 && (
        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={`Search ${label.toLowerCase()}`}
            className="h-10 rounded-b-none border-0 bg-transparent pl-9 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      )}
      <div role="group" aria-label={label} className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{options.length === 0 ? emptyText : 'No matches.'}</p>
        ) : (
          visible.map((o) => {
            const cid = `${id}-${o.value}`;
            return (
              <label
                key={o.value}
                htmlFor={cid}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-surface-2',
                  o.disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <Checkbox id={cid} checked={selected.has(o.value)} disabled={o.disabled} onCheckedChange={(c) => toggle(o.value, c === true)} />
                {o.leading && <span aria-hidden>{o.leading}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>}
                </span>
              </label>
            );
          })
        )}
      </div>
      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
        {value.length} selected
      </p>
    </div>
  );
}
