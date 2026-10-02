import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useCategories } from '@/features/lookups/api';
import { friendlyError } from '@/lib/errors';

import { useDeleteCategory, useSaveCategory } from './api';

type Row = { id?: string; name: string; default_max_points: number; is_active: boolean; sort_order: number };

/** Task categories and their default points. Used ones can be switched off, not deleted. */
export function CategoriesTab() {
  const categories = useCategories();
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const [rows, setRows] = useState<Row[]>([]);
  const serverKey = JSON.stringify(categories.data ?? []);

  // reset local edits whenever the saved list changes
  useEffect(() => setRows(JSON.parse(serverKey) as Row[]), [serverKey]);

  const original = new Map((categories.data ?? []).map((c) => [c.id, c]));
  const dirty = (r: Row) => {
    if (!r.id) return true;
    const o = original.get(r.id);
    return !o || o.name !== r.name || o.default_max_points !== r.default_max_points || o.is_active !== r.is_active;
  };
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function saveRow(r: Row) {
    if (r.name.trim().length < 2) return toast.error('Give the category a name');
    if (!Number.isInteger(r.default_max_points) || r.default_max_points < 1 || r.default_max_points > 1000) return toast.error('Default points must be 1–1000');
    save.mutate(r, {
      onSuccess: () => toast.success(r.id ? 'Category saved' : 'Category added'),
      onError: (e) => toast.error((e as { code?: string }).code === '23505' ? 'A category with that name already exists' : friendlyError(e)),
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Task categories</CardTitle>
        <p className="text-sm text-muted-foreground">The default points fill in when you pick a category for a new task. Changing them doesn’t touch existing tasks.</p>
      </CardHeader>
      <CardContent>
        {categories.isPending ? (
          <Skeleton className="h-48" />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_7rem_5rem_9rem] gap-3 px-1 pb-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Name</span>
              <span>Default points</span>
              <span>Active</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li key={r.id ?? `new-${i}`} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-lg border border-border p-2 sm:grid-cols-[minmax(0,1fr)_7rem_5rem_9rem] sm:border-0 sm:p-1">
                  <Input value={r.name} maxLength={60} onChange={(e) => set(i, { name: e.target.value })} aria-label="Category name" className="col-span-2 sm:col-span-1" />
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={Number.isNaN(r.default_max_points) ? '' : r.default_max_points}
                    onChange={(e) => set(i, { default_max_points: e.target.valueAsNumber })}
                    aria-label={`Default points for ${r.name || 'new category'}`}
                    className="tabular"
                  />
                  <Switch checked={r.is_active} onCheckedChange={(on) => set(i, { is_active: on })} aria-label={`${r.name || 'New category'} available for new tasks`} />
                  <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
                    <Button size="sm" variant={dirty(r) ? 'default' : 'ghost'} disabled={!dirty(r)} loading={save.isPending && save.variables?.name === r.name} onClick={() => saveRow(r)}>
                      {r.id ? 'Save' : 'Add'}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${r.name || 'new category'}`}
                      onClick={() =>
                        r.id
                          ? remove.mutate(r.id, {
                              onSuccess: () => toast.success('Category deleted'),
                              onError: (e) =>
                                toast.error((e as { code?: string }).code === '23503' ? 'Tasks use this category — switch it off instead of deleting it.' : friendlyError(e)),
                            })
                          : setRows((rs) => rs.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => setRows((rs) => [...rs, { name: '', default_max_points: 10, is_active: true, sort_order: rs.length + 1 }])}
            >
              <Plus /> Add category
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
