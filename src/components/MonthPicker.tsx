import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatMonth, monthKey, shiftMonth } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface MonthPickerProps {
  value: string; // YYYY-MM
  onChange: (key: string) => void;
  className?: string;
}

/** Previous / next month stepper with a jump back to the current month. */
export function MonthPicker({ value, onChange, className }: MonthPickerProps) {
  const current = monthKey();
  return (
    <div
      className={cn('inline-flex h-10 items-center rounded-lg border border-border bg-surface shadow-soft', className)}
      role="group"
      aria-label="Month"
    >
      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-r-none" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Previous month">
        <ChevronLeft />
      </Button>
      <button
        type="button"
        onClick={() => onChange(current)}
        disabled={value === current}
        className="flex h-10 min-w-[9.5rem] items-center justify-center gap-2 border-x border-border px-3 text-sm font-medium tabular transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
        title={value === current ? undefined : 'Jump to this month'}
        aria-live="polite"
      >
        <CalendarDays className="h-4 w-4 text-primary-text" aria-hidden />
        {formatMonth(value)}
      </button>
      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-l-none" onClick={() => onChange(shiftMonth(value, 1))} aria-label="Next month">
        <ChevronRight />
      </Button>
    </div>
  );
}
