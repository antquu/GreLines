import { useCallback, useRef } from 'react';

export function useWheelScroll<T extends HTMLElement>() {
  const detach = useRef<(() => void) | null>(null);

  return useCallback((node: T | null) => {
    detach.current?.();
    detach.current = null;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      const max = node.scrollWidth - node.clientWidth;
      const atStart = node.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = node.scrollLeft >= max && event.deltaY > 0;
      if (atStart || atEnd) return;

      event.preventDefault();
      node.scrollLeft = Math.max(0, Math.min(max, node.scrollLeft + event.deltaY));
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    detach.current = () => node.removeEventListener('wheel', onWheel);
  }, []);
}
