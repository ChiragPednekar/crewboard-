import { Clapperboard, Plus, Trophy } from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { STATUS_META, StatusChip } from '@/components/StatusChip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import type { TaskStatus } from '@/lib/supabase';

const SWATCHES = [
  ['background', 'bg-background'],
  ['surface', 'bg-surface'],
  ['surface-2', 'bg-surface-2'],
  ['border', 'bg-border'],
  ['primary (amber)', 'bg-primary'],
  ['violet', 'bg-violet'],
  ['success', 'bg-success'],
  ['warning', 'bg-warning'],
  ['danger', 'bg-danger'],
  ['info', 'bg-info'],
  ['gold', 'bg-gold'],
  ['silver', 'bg-silver'],
  ['bronze', 'bg-bronze'],
] as const;

/** Living reference for the design tokens and core components. */
export default function StyleguidePage() {
  return (
    <>
      <PageHeader
        eyebrow="Design system"
        title="CrewBoard UI kit"
        description="Tokens and components used across the app. Toggle the theme to check both modes."
      />

      <section className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Colour tokens</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {SWATCHES.map(([name, cls]) => (
              <div key={name}>
                <div className={`h-14 rounded-lg border border-border ${cls}`} />
                <p className="mt-1.5 text-xs text-muted-foreground">{name}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Typography</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-display text-4xl font-semibold">Space Grotesk 36</p>
              <p className="font-display text-2xl font-semibold">Page title 28</p>
              <p className="text-base">Inter body 16 — the quick brown fox films the lazy dog.</p>
              <p className="text-sm text-muted-foreground">Muted 14 — secondary information and hints.</p>
              <p className="tabular font-display text-5xl font-semibold text-primary-text">93.03</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status chips</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => (
                <StatusChip key={s} status={s} />
              ))}
              <StatusChip status="in_progress" overdue />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Buttons</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button>
                <Plus /> Primary
              </Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button loading>Saving</Button>
              <Button variant="link">Link</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inputs & progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sg-input">Deliverable link</Label>
                <Input id="sg-input" placeholder="https://drive.google.com/…" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Completion</span>
                  <span className="tabular text-muted-foreground">72%</span>
                </div>
                <Progress value={72} />
              </div>
              <div className="flex items-center gap-3">
                <UserAvatar name="Priya Nair" ring="gold" />
                <UserAvatar name="Arjun Mehta" ring="silver" />
                <UserAvatar name="Sana Shaikh" ring="bronze" />
                <UserAvatar name="Rohan Kulkarni" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <EmptyState
            icon={Clapperboard}
            title="No tasks yet"
            description="When your admin publishes this month’s plan, your shoots will appear here."
            action={<Button variant="secondary">Refresh</Button>}
          />
          <Card>
            <CardContent className="space-y-3 p-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Trophy className="h-4 w-4 text-gold-text" aria-hidden /> Skeleton loaders
              </div>
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
