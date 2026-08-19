import { useLayoutEffect, useRef, useState } from 'react';

const MARQUEE_SPEED_PX_PER_SEC = 60;

export function MarqueeText({
  text,
  className = '',
  
  gap = 48,
}: {
  text: string;
  className?: string;
  gap?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [durationSec, setDurationSec] = useState(12);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const update = () => {
      const containerWidth = container.clientWidth;
      const textWidth = measure.getBoundingClientRect().width;
      if (containerWidth === 0 || textWidth === 0) return;

      setOverflows(textWidth > containerWidth);
      setDurationSec(Math.max(6, (textWidth + gap) / MARQUEE_SPEED_PX_PER_SEC));
    };

    update();
    
    
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [text, gap]);

  return (
    <span ref={containerRef} className="relative block w-full overflow-hidden">
      {}
      <span
        ref={measureRef}
        aria-hidden="true"
        className={`pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap ${className}`}
      >
        {text}
      </span>

      {overflows ? (
        <span
          className={`flex w-max whitespace-nowrap ${className}`}
          style={{
            animationName: 'footer-marquee',
            animationDuration: `${durationSec}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
          }}
        >
          <span style={{ paddingRight: gap }}>{text}</span>
          <span aria-hidden="true" style={{ paddingRight: gap }}>{text}</span>
        </span>
      ) : (
        <span className={`block whitespace-nowrap ${className}`}>{text}</span>
      )}
    </span>
  );
}
