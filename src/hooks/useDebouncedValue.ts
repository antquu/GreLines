import { useEffect, useState } from 'react';

/**
 * Returns a value that only updates `delayMs` after the input stops changing.
 * Useful for de-bouncing search inputs so we don't fire a network request on
 * every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}