import { Clapperboard, Film, Trophy } from 'lucide-react';
import { Outlet } from 'react-router';

import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

const HIGHLIGHTS = [
  { icon: Clapperboard, title: 'Plan every shoot', body: 'Monthly plans, briefs and references for each client, in one place.' },
  { icon: Film, title: 'Deliver from location', body: 'Update status and drop deliverable links from your phone — or your Google Sheet.' },
  { icon: Trophy, title: 'Earn the top spot', body: 'Points, monthly assessments and a leaderboard that celebrates the best work.' },
];

export function AuthLayout() {
  return (
    <div className="grid grid-cols-1 min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="studio-glow absolute inset-0" aria-hidden />
        <div className="grade-line absolute inset-x-0 top-0 h-[3px]" aria-hidden />
        <Logo className="relative" />
        <div className="relative max-w-lg">
          <p className="slate mb-4 text-primary-text">Production crew portal</p>
          <h2 className="font-display text-[42px] font-semibold leading-[1.04]">
            Every shoot, every deliverable, <span className="text-primary-text">every win</span> — on one board.
          </h2>
          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-background/60 text-violet-text">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-sm text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="slate relative text-muted-foreground">Times shown in India Standard Time (IST)</p>
      </aside>

      {/* Form panel */}
      <main className="studio-glow relative flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
