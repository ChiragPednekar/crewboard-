import { useMemo, useState } from 'react';
import { ArrowRight, Award, Download, FileSpreadsheet, Wand2 } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MonthPicker } from '@/components/MonthPicker';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { useCrewOptions } from '@/features/lookups/api';
import { emptySummary, useCrewMonth } from '@/features/videographers/api';
import { useMonthParam } from '@/hooks/useSearchParamState';
import { formatDateTime, formatMonth, submittedOnTime } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { downloadCsv, downloadXlsx, type ExportTable } from '@/lib/export';
import { computeScore } from '@/lib/scoring';

import { type Assessment, assessmentState, fetchMonthTasks, metricsOf, useComputeMonth, useMonthAssessments, weightsOf } from './api';
import { AssessmentStateChip } from './AssessmentStateChip';
import { STATUS_TEXT } from './planned';

const pct = (r: number) => Math.round(r * 1000) / 10;

export default function AssessmentsPage() {
  const [month, setMonth] = useMonthParam();
  const crew = useCrewOptions();
  const stats = useCrewMonth(month);
  const assessments = useMonthAssessments(month);
  const computeAll = useComputeMonth();
  const [exporting, setExporting] = useState(false);

  // Everyone with a published plan this month, plus anyone already assessed.
  const rows = useMemo(() => {
    const byId = new Map<string, Assessment>((assessments.data ?? []).map((a) => [a.videographer_id, a]));
    return (crew.data ?? [])
      .filter((p) => stats.data?.get(p.id)?.planStatus === 'published' || byId.has(p.id))
      .map((p) => ({ person: p, a: byId.get(p.id) ?? null, s: stats.data?.get(p.id) ?? emptySummary() }))
      .sort((x, y) => Number(y.a?.total_score ?? -1) - Number(x.a?.total_score ?? -1) || x.person.full_name.localeCompare(y.person.full_name));
  }, [crew.data, stats.data, assessments.data]);

  const counts = {
    none: rows.filter((r) => !r.a).length,
    draft: rows.filter((r) => r.a?.status === 'draft').length,
    published: rows.filter((r) => r.a?.status === 'published').length,
  };

  function scoresTable(): ExportTable {
    return {
      name: `Assessments ${formatMonth(month)}`,
      headers: [
        'Videographer', 'Status', 'Assigned', 'Approved', 'Submitted', 'On time', 'Points', 'Max points',
        'Points %', 'Completion %', 'Punctuality %', 'Discretionary (0-10)', 'Bonus', 'Bonus reason', 'Base score', 'Total score', 'Published at',
      ],
      rows: rows.map(({ person, a }) => {
        if (!a) return [person.full_name, 'Not started'];
        const sc = computeScore({ metrics: metricsOf(a), weights: weightsOf(a), discretionary: a.discretionary_score === null ? null : Number(a.discretionary_score), bonus: Number(a.bonus_points) });
        return [
          person.full_name,
          a.status === 'published' ? 'Published' : 'Draft',
          a.assigned_count, a.approved_count, a.submitted_count, a.on_time_count, a.points_awarded_sum, a.max_points_sum,
          pct(sc.pointsPct), pct(sc.completionPct), pct(sc.punctualityPct),
          a.discretionary_score === null ? null : Number(a.discretionary_score),
          Number(a.bonus_points), a.bonus_reason, Number(a.base_score), Number(a.total_score),
          a.published_at ? formatDateTime(a.published_at, 'yyyy-MM-dd HH:mm') : null,
        ];
      }),
    };
  }

  async function tasksTable(): Promise<ExportTable> {
    const tasks = await fetchMonthTasks(month);
    return {
      name: `Planned vs completed ${formatMonth(month)}`,
      headers: ['Videographer', 'Task', 'Client', 'Category', 'Due', 'Status', 'First submitted', 'Delivery', 'Max points', 'Points awarded', 'Rating'],
      rows: tasks.map((t) => [
        t.videographer?.full_name, t.title, t.client?.name, t.category?.name, t.due_date, STATUS_TEXT[t.status],
        t.first_submitted_at ? formatDateTime(t.first_submitted_at, 'yyyy-MM-dd HH:mm') : null,
        t.first_submitted_at ? (submittedOnTime(t.first_submitted_at, t.due_date) ? 'On time' : 'Late') : null,
        t.max_points, t.status === 'approved' ? t.points_awarded : null, t.quality_rating,
      ]),
    };
  }

  async function runExport(kind: 'scores' | 'tasks', format: 'csv' | 'xlsx') {
    setExporting(true);
    try {
      const table = kind === 'scores' ? scoresTable() : await tasksTable();
      if (format === 'csv') downloadCsv(table);
      else await downloadXlsx(table);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Assessments"
        description="Score each videographer’s month, then publish to lock it. Published scores feed the leaderboard."
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" loading={exporting} disabled={rows.length === 0}>
                  {!exporting && <Download />} Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Scores</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => void runExport('scores', 'xlsx')}>
                  <FileSpreadsheet /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void runExport('scores', 'csv')}>
                  <FileSpreadsheet /> CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Planned vs completed (every task)</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => void runExport('tasks', 'xlsx')}>
                  <FileSpreadsheet /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void runExport('tasks', 'csv')}>
                  <FileSpreadsheet /> CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {counts.none > 0 && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/30 p-4 studio-glow sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            <span className="font-medium">{counts.none} not started.</span>{' '}
            <span className="text-muted-foreground">Create drafts for everyone from their {formatMonth(month, 'MMMM')} tasks; you then add discretionary scores and publish.</span>
          </p>
          <Button
            loading={computeAll.isPending}
            onClick={() =>
              computeAll.mutate(month, {
                onSuccess: (r) => toast.success(`${r?.length ?? 0} drafts ready`),
                onError: (e) => toast.error(friendlyError(e)),
              })
            }
          >
            {!computeAll.isPending && <Wand2 />} Create drafts
          </Button>
        </div>
      )}

      {crew.isPending || stats.isPending || assessments.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : assessments.isError ? (
        <ErrorState error={assessments.error} onRetry={() => void assessments.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Award} title={`Nobody to assess for ${formatMonth(month)}`} description="Assessments are for videographers with a published plan that month." />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            <span className="tabular font-medium text-foreground">{counts.published}</span> published · <span className="tabular font-medium text-foreground">{counts.draft}</span> draft ·{' '}
            <span className="tabular font-medium text-foreground">{counts.none}</span> not started
          </p>
          <ul className="space-y-3">
            {rows.map(({ person: p, a, s }) => {
              const sc = a
                ? computeScore({ metrics: metricsOf(a), weights: weightsOf(a), discretionary: a.discretionary_score === null ? null : Number(a.discretionary_score), bonus: Number(a.bonus_points) })
                : null;
              return (
                <li key={p.id}>
                  <Card className="group relative flex flex-col gap-4 p-4 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-lift md:flex-row md:items-center sm:p-5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <UserAvatar name={p.full_name} src={p.avatar_url} className="h-11 w-11" />
                      <div className="min-w-0">
                        <h2 className="truncate font-medium">
                          <Link to={`/admin/assessments/${p.id}/${month}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
                            {p.full_name}
                          </Link>
                        </h2>
                        <div className="mt-1">
                          <AssessmentStateChip state={assessmentState(a)} />
                        </div>
                      </div>
                    </div>
                    <dl className="tabular grid grid-cols-4 gap-3 text-sm md:w-[26rem]">
                      <Metric label="Points" value={a ? `${a.points_awarded_sum}/${a.max_points_sum}` : `${s.points}/${s.maxPoints}`} />
                      <Metric label="Done" value={a ? `${a.approved_count}/${a.assigned_count}` : `${s.approved}/${s.total}`} />
                      <Metric label="On time" value={sc ? `${pct(sc.punctualityPct)}%` : '–'} />
                      <Metric label="Score" value={a ? Number(a.total_score).toFixed(2) : '–'} strong />
                    </dl>
                    <span className="hidden items-center gap-1 text-sm font-medium text-primary-text md:flex" aria-hidden>
                      {a ? 'Open' : 'Start'} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? 'font-display text-lg font-semibold text-primary-text' : 'font-display text-base font-semibold'}>{value}</dd>
    </div>
  );
}
