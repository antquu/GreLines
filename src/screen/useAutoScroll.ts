import { useEffect, useRef } from 'react';

const SPEED_PX_PER_SEC = 60;

const EASE_DISTANCE_PX = 70;

const HOLD_TOP_MS = 4000;

const HOLD_BOTTOM_MS = 5000;

const MIN_SPEED_RATIO = 0.3;

export function useAutoScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let frame = 0;
    let previous = performance.now();
    let phase: 'holdTop' | 'run' | 'holdBottom' = 'holdTop';
    let until = previous + HOLD_TOP_MS;
    
    let offset = 0;

    const restartAtTop = (now: number) => {
      offset = 0;
      node.scrollTop = 0;
      phase = 'holdTop';
      until = now + HOLD_TOP_MS;
    };

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const elapsed = Math.min(0.05, (now - previous) / 1000);
      previous = now;

      const max = node.scrollHeight - node.clientHeight;
      
      if (max <= 8) {
        if (offset !== 0) restartAtTop(now);
        return;
      }

      if (phase === 'holdTop') {
        if (now >= until) phase = 'run';
        return;
      }

      if (phase === 'holdBottom') {
        if (now >= until) restartAtTop(now);
        return;
      }

      const remaining = max - offset;
      
      const ratio = Math.max(MIN_SPEED_RATIO, Math.min(1, remaining / EASE_DISTANCE_PX));
      offset = Math.min(max, offset + SPEED_PX_PER_SEC * ratio * elapsed);
      node.scrollTop = offset;

      if (max - offset < 0.5) {
        offset = max;
        node.scrollTop = max;
        phase = 'holdBottom';
        until = now + HOLD_BOTTOM_MS;
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  return ref;
}
