import { useEffect, useState } from 'react';
import { Building2, Lock, Plus, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';

import { useAppSettings, useUpdateAppSettings } from './api';

type Mode = 'invite_only' | 'requests';

const MODES: { value: Mode; icon: typeof Lock; title: string; body: string }[] = [
  {
    value: 'invite_only',
    icon: Lock,
    title: 'Only people we add',
    body: 'Recommended. Anyone you haven’t added (or who isn’t on your company domain) is turned away at sign-in.',
  },
  {
    value: 'requests',
    icon: UserPlus,
    title: 'Anyone can request access',
    body: 'Anyone with a Google account can ask to join, and you approve or decline each request.',
  },
];

/** Normalise "Name@Studio.in" or " studio.in " to "studio.in". */
export function cleanDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^.*@/, '');
}

export function AccessTab() {
  const settings = useAppSettings();
  const update = useUpdateAppSettings();
  const [mode, setMode] = useState<Mode>('invite_only');
  const [domains, setDomains] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (settings.data) {
      setMode(settings.data.signup_mode as Mode);
      setDomains(settings.data.company_domains);
    }
  }, [settings.data]);

  function addDomain() {
    const d = cleanDomain(draft);
    if (!d) return;
    if (!domains.includes(d)) setDomains([...domains, d]);
    setDraft('');
  }

  function save() {
    const pending = cleanDomain(draft);
    const next = pending && !domains.includes(pending) ? [...domains, pending] : domains;
    update.mutate(
      { signup_mode: mode, company_domains: next },
      {
        onSuccess: () => {
          setDraft('');
          toast.success('Access settings saved');
        },
        onError: (err) => toast.error(friendlyError(err)),
      },
    );
  }

  const dirty =
    settings.data &&
    (mode !== settings.data.signup_mode || draft.trim() !== '' || domains.join(',') !== settings.data.company_domains.join(','));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Who can join</CardTitle>
        <p className="text-sm text-muted-foreground">
          CrewBoard is private to your studio. Add people under Videographers › Add by Google sign-in, or let everyone on your company email domain in.
        </p>
      </CardHeader>
      <CardContent>
        {settings.isPending ? (
          <Skeleton className="h-64" />
        ) : (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Sign-up</legend>
              {MODES.map((m) => (
                <label
                  key={m.value}
                  htmlFor={`signup-mode-${m.value}`}
                  className={cn(
                    'grid cursor-pointer grid-cols-[20px_1fr] gap-x-3 gap-y-1 rounded-xl border p-4 transition-colors',
                    mode === m.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                >
                  <input id={`signup-mode-${m.value}`} type="radio" name="signup-mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="sr-only" />
                  <m.icon className={cn('row-span-2 mt-0.5 h-5 w-5', mode === m.value ? 'text-primary-text' : 'text-muted-foreground')} aria-hidden />
                  <span className="font-medium">{m.title}</span>
                  <span className="text-sm text-muted-foreground">{m.body}</span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="company-domain" className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden /> Company email domains
              </Label>
              <p className="text-sm text-muted-foreground">
                Optional. Anyone signing in with Google on these domains joins straight away as crew, e.g. <span className="font-medium text-foreground">yourstudio.in</span>.
                Public services like gmail.com can’t be used.
              </p>
              {domains.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {domains.map((d) => (
                    <li key={d} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1 text-sm">
                      @{d}
                      <Button type="button" variant="ghost" size="icon-sm" className="h-6 w-6" onClick={() => setDomains(domains.filter((x) => x !== d))} aria-label={`Remove ${d}`}>
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex max-w-md gap-2">
                <Input
                  id="company-domain"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addDomain();
                    }
                  }}
                  placeholder="yourstudio.in"
                  autoComplete="off"
                />
                <Button type="button" variant="secondary" onClick={addDomain} disabled={!draft.trim()}>
                  <Plus /> Add
                </Button>
              </div>
            </div>

            <div className="flex justify-end border-t border-border pt-4">
              <Button type="submit" disabled={!dirty} loading={update.isPending}>
                Save access settings
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
