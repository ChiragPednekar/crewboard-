import { motion } from 'framer-motion';
import { Crown } from 'lucide-react';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';

import { CountUp } from '@/components/CountUp';
import { UserAvatar } from '@/components/UserAvatar';
import type { LeaderboardRow } from '@/features/leaderboard/api';
import { cn } from '@/lib/utils';

const PLACE = {
  1: { ring: 'gold', text: 'text-gold-text', bar: 'h-28 sm:h-32', bg: 'bg-gold/15 border-gold/40', label: '1st' },
  2: { ring: 'silver', text: 'text-silver-text', bar: 'h-20 sm:h-24', bg: 'bg-silver/10 border-silver/30', label: '2nd' },
  3: { ring: 'bronze', text: 'text-bronze-text', bar: 'h-14 sm:h-16', bg: 'bg-bronze/10 border-bronze/30', label: '3rd' },
} as const;

const score = (r: LeaderboardRow) => Number(r.total_score);
const ORDINAL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

/** Top three on steps: 2nd · 1st · 3rd. */
export function Podium({ rows, provisional, meId }: { rows: LeaderboardRow[]; provisional: boolean; meId: string }) {
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;
  // visual order 2 · 1 · 3, but keep DOM order 1 · 2 · 3 for screen readers
  const order = ['order-2', 'order-1', 'order-3'];
  return (
    <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4" aria-label="Podium">
      {top.map((r, i) => {
        const place = (Math.min(i + 1, 3) as 1 | 2 | 3);
        const p = PLACE[place];
        return (
          <motion.li
            key={r.videographer_id}
            className={cn('flex flex-col items-center', order[i])}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + (place === 1 ? 0.25 : place === 2 ? 0.1 : 0.4), type: 'spring', stiffness: 160, damping: 18 }}
          >
            <div className="relative">
              {place === 1 && <Crown className="absolute -top-6 left-1/2 h-6 w-6 -translate-x-1/2 text-gold-text" aria-hidden />}
              <UserAvatar name={r.full_name} src={r.avatar_url} ring={p.ring} className={cn(place === 1 ? 'h-16 w-16 text-xl sm:h-20 sm:w-20' : 'h-12 w-12 text-base sm:h-14 sm:w-14')} />
            </div>
            <p className="mt-3 max-w-full truncate text-center text-sm font-medium">
              {r.full_name.split(' ')[0]}
              {r.videographer_id === meId && <span className="text-primary-text"> (you)</span>}
            </p>
            <p className="tabular font-display text-lg font-semibold sm:text-xl">
              <CountUp value={score(r)} decimals={provisional ? 0 : 2} />
              {provisional && <span className="text-xs font-normal text-muted-foreground"> pts</span>}
            </p>
            <div className={cn('mt-2 flex w-full items-start justify-center rounded-t-xl border border-b-0 pt-2', p.bar, p.bg)}>
              <span className={cn('font-display text-sm font-semibold', p.text)}>
                <span className="sr-only">Rank </span>
                {rows.filter((x) => x.rank === r.rank).length > 1 ? `=${ORDINAL[r.rank] ?? r.rank}` : (ORDINAL[r.rank] ?? p.label)}
              </span>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

/** Full standings: a horizontal bar chart (leader in amber) plus the same data as a readable list. */
export function StandingsChart({ rows, provisional, meId }: { rows: LeaderboardRow[]; provisional: boolean; meId: string }) {
  const data = rows.map((r) => ({ name: r.full_name.split(' ')[0] ?? r.full_name, value: score(r), id: r.videographer_id }));
  const max = Math.max(...data.map((d) => d.value), provisional ? 1 : 100);
  return (
    <div>
      <div style={{ height: Math.max(160, data.length * 44) }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap={10}>
            <XAxis type="number" hide domain={[0, provisional ? max : 100]} />
            <YAxis
              type="category"
              dataKey="name"
              width={84}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 13 }}
            />
            <Bar dataKey="value" radius={[0, 8, 8, 0]} isAnimationActive animationDuration={900} background={{ fill: 'hsl(var(--surface-2))', radius: 8 }}>
              {data.map((d, i) => (
                <Cell key={d.id} fill={i === 0 ? 'hsl(var(--primary))' : 'hsl(var(--violet))'} fillOpacity={d.id === meId || i === 0 ? 1 : 0.75} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v: number) => (provisional ? String(v) : v.toFixed(2))}
                style={{ fill: 'hsl(var(--foreground))', fontSize: 13, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Standings</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 font-medium">#</th>
            <th className="py-2 pr-2 font-medium">Name</th>
            <th className="py-2 pr-2 text-right font-medium">Tasks done</th>
            <th className="py-2 text-right font-medium">{provisional ? 'Points' : 'Score'}</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((r) => (
            <tr key={r.videographer_id} className={cn('border-b border-border/50', r.videographer_id === meId && 'bg-primary/[0.06]')}>
              <td className="py-2 pr-2 text-muted-foreground">{r.rank}</td>
              <td className="py-2 pr-2">
                <span className="flex items-center gap-2">
                  <UserAvatar name={r.full_name} src={r.avatar_url} className="h-6 w-6 text-[10px]" />
                  <span className="truncate">{r.full_name}</span>
                  {r.videographer_id === meId && <span className="text-xs text-primary-text">you</span>}
                </span>
              </td>
              <td className="py-2 pr-2 text-right text-muted-foreground">
                {r.tasks_completed}/{r.tasks_assigned}
              </td>
              <td className="py-2 text-right font-semibold">{provisional ? score(r) : score(r).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
