import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

import { monthKey } from '@/lib/dates';

/** Selected month kept in `?month=YYYY-MM`, so links and refreshes keep context. */
export function useMonthParam(): [string, (key: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('month');
  const month = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : monthKey();
  const setMonth = useCallback(
    (key: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('month', key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [month, setMonth];
}

/** A string search param with an allow-list of values. */
export function useEnumParam<T extends string>(name: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(name);
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const setValue = useCallback(
    (v: T) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === fallback) next.delete(name);
          else next.set(name, v);
          return next;
        },
        { replace: true },
      ),
    [setParams, name, fallback],
  );
  return [value, setValue];
}
