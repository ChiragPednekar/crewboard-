import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

/** Number that counts up when it appears (instant for reduced-motion users). */
export function CountUp({ value, decimals = 0, duration = 1.1, className }: { value: number; decimals?: number; duration?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  return (
    <span className={className}>
      <span aria-hidden>{shown.toFixed(decimals)}</span>
      <span className="sr-only">{value.toFixed(decimals)}</span>
    </span>
  );
}
