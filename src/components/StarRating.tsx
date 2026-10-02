import { useId } from 'react';
import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

const LABELS = ['Poor', 'Needs work', 'Good', 'Great', 'Outstanding'];

/** 1–5 star picker as a radio group (arrow keys work, each star is labelled). */
export function StarRating({ value, onChange, invalid }: { value: number | null; onChange: (v: number) => void; invalid?: boolean }) {
  const name = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div role="radiogroup" aria-label="Quality rating" aria-invalid={invalid || undefined} className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer rounded-md p-1 focus-within:ring-2 focus-within:ring-ring">
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
              aria-label={`${n} star${n > 1 ? 's' : ''}: ${LABELS[n - 1]}`}
            />
            <Star
              className={cn(
                'h-6 w-6 transition-colors',
                value !== null && n <= value ? 'fill-gold text-gold-text' : 'text-muted-foreground hover:text-gold-text',
              )}
              aria-hidden
            />
          </label>
        ))}
      </div>
      <span className="whitespace-nowrap text-sm text-muted-foreground" aria-hidden>
        {value ? LABELS[value - 1] : 'Pick a rating'}
      </span>
    </div>
  );
}
