import { useMemo, useState } from 'react';
import { Building, MapPin, Plus, SearchX } from 'lucide-react';
import { Link } from 'react-router';

import { AvatarStack } from '@/components/AvatarStack';
import { Chip } from '@/components/Chips';
import { ClientLogo } from '@/components/ClientLogo';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput, Segmented } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { useClients } from './api';
import { ClientFormDialog } from './ClientFormDialog';
import { CLIENT_TYPE_LABEL, CLIENT_TYPES, clientTypeLabel } from './schemas';

type Show = 'active' | 'archived' | 'all';

export default function ClientsPage() {
  const clients = useClients();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string>('all');
  const [show, setShow] = useState<Show>('active');
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => {
    const list = clients.data ?? [];
    return { active: list.filter((c) => c.is_active).length, archived: list.filter((c) => !c.is_active).length, all: list.length };
  }, [clients.data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (clients.data ?? []).filter(
      (c) =>
        (show === 'all' || (show === 'active' ? c.is_active : !c.is_active)) &&
        (type === 'all' || c.type === type) &&
        (!q || `${c.name} ${c.city ?? ''} ${c.contact_name ?? ''}`.toLowerCase().includes(q)),
    );
  }, [clients.data, query, type, show]);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Hospitals, brands and everyone in between. Assign crew so they see the client’s details."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add client
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search clients" className="md:max-w-xs md:flex-1" />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="md:w-44" aria-label="Client type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {CLIENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {CLIENT_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Segmented
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'archived', label: 'Archived', count: counts.archived },
            { value: 'all', label: 'All', count: counts.all },
          ]}
        />
      </div>

      {clients.isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : clients.isError ? (
        <ErrorState error={clients.error} onRetry={() => void clients.refetch()} />
      ) : counts.all === 0 ? (
        <EmptyState
          icon={Building}
          title="No clients yet"
          description="Add the hospitals, clinics and brands your crew shoots for."
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add your first client
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={SearchX} title="No clients match" description="Try a different search or filter." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <li key={c.id}>
              <Card className="group relative h-full p-5 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-lift">
                <div className="flex items-start gap-3">
                  <ClientLogo name={c.name} src={c.logo_url} className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-base font-semibold">
                      <Link to={`/admin/clients/${c.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
                        {c.name}
                      </Link>
                    </h2>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
                      {c.city ? (
                        <>
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> {c.city}
                        </>
                      ) : (
                        'No city'
                      )}
                    </p>
                  </div>
                  <Chip>{clientTypeLabel(c.type)}</Chip>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <AvatarStack people={c.crew} />
                  {!c.is_active ? (
                    <Chip className="bg-transparent">Archived</Chip>
                  ) : (
                    c.contact_name && <span className="truncate text-xs text-muted-foreground">{c.contact_name}</span>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ClientFormDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
