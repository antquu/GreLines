import { useLayoutEffect, useRef } from 'react';

const MIN_SCALE = 0.4;

export function FitText({ text, padding = 2 }: { text: string; padding?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    const box = node?.parentElement;
    if (!node || !box) return;
    const fit = () => {
      node.style.fontSize = '';
      const available = box.clientWidth - padding * 2;
      const needed = node.scrollWidth;
      if (available > 0 && needed > available) {
        node.style.fontSize = `${Math.max(MIN_SCALE, available / needed)}em`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text, padding]);

  return (
    <span ref={ref} className="whitespace-nowrap leading-none">
      {text}
    </span>
  );
}

export function BadgeLabel({ text }: { text: string }) {
  return text.length > 2 ? <FitText text={text} /> : <>{text}</>;
}
