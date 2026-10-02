import { useState } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CheckList } from '@/components/CheckList';
import { StarRating } from '@/components/StarRating';
import { useOnOpen } from '@/hooks/useOnOpen';

describe('CheckList', () => {
  const options = Array.from({ length: 8 }, (_, i) => ({ value: `v${i}`, label: `Person ${i}`, hint: i === 3 ? 'Kesar' : undefined }));

  function Harness({ initial = [] as string[] }) {
    const [value, setValue] = useState(initial);
    return <CheckList label="Crew" options={options} value={value} onChange={setValue} />;
  }

  it('toggles items, keeps option order and announces the count', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Person 5'));
    fireEvent.click(screen.getByLabelText('Person 1'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByLabelText('Person 1')).toHaveAttribute('data-state', 'checked');
    fireEvent.click(screen.getByLabelText('Person 5'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('filters by label and hint when the list is long', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Search crew'), { target: { value: 'kesar' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search crew'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });
});

describe('StarRating', () => {
  it('is a labelled radio group', () => {
    const onChange = vi.fn();
    render(<StarRating value={null} onChange={onChange} />);
    expect(screen.getByRole('radiogroup', { name: 'Quality rating' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('4 stars: Great'));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});

describe('useOnOpen', () => {
  it('runs once per opening, not on re-renders while open', () => {
    const fn = vi.fn();
    const { rerender } = renderHook(({ open }) => useOnOpen(open, fn), { initialProps: { open: false } });
    expect(fn).not.toHaveBeenCalled();
    rerender({ open: true });
    rerender({ open: true });
    expect(fn).toHaveBeenCalledTimes(1);
    act(() => rerender({ open: false }));
    rerender({ open: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
