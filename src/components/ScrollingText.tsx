import { useLayoutEffect, useRef, useState } from 'react';

const SPEED_PX_PER_SEC = 35;
const START_PAUSE_MS = 1500;
const END_PAUSE_MS = 2500;

export function ScrollingText({ text, className = '' }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const inner = textRef.current;
    if (!container || !inner) return;

    let animation: Animation | null = null;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const update = () => {
      animation?.cancel();
      animation = null;
      const distance = inner.scrollWidth - container.clientWidth;
      const tooLong = distance > 1;
      setOverflows(tooLong);
      if (!tooLong || reduced || typeof inner.animate !== 'function') return;

      const scrollMs = (distance / SPEED_PX_PER_SEC) * 1000;
      const total = START_PAUSE_MS + scrollMs + END_PAUSE_MS;
      animation = inner.animate(
        [
          { transform: 'translateX(0)', offset: 0 },
          { transform: 'translateX(0)', offset: START_PAUSE_MS / total },
          { transform: `translateX(${-distance}px)`, offset: (START_PAUSE_MS + scrollMs) / total },
          { transform: `translateX(${-distance}px)`, offset: 1 },
        ],
        { duration: total, iterations: Infinity, easing: 'linear' },
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => {
      observer.disconnect();
      animation?.cancel();
    };
  }, [text]);

  return (
    <span ref={containerRef} className="block w-full overflow-hidden" title={overflows ? text : undefined}>
      <span ref={textRef} className={`inline-block whitespace-nowrap ${className}`}>
        {text}
      </span>
    </span>
  );
}
