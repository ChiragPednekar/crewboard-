import { useEffect, useRef } from 'react';

/**
 * Run `fn` each time `open` turns true (dialog reset), and never while it stays open,
 * so a background refetch can't wipe what someone is typing.
 */
export function useOnOpen(open: boolean, fn: () => void) {
  const fnRef = useRef(fn);
  const wasOpen = useRef(false);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (open && !wasOpen.current) fnRef.current();
    wasOpen.current = open;
  }, [open]);
}
