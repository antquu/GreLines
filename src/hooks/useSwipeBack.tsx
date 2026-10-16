import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

const SWIPE_START_PX = 10;
const SWIPE_CLOSE_RATIO = 0.33;
const SWIPE_CLOSE_SPEED = 0.5;
const SWIPE_SETTLE_MS = 260;
const SWIPE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SWIPE_DIM = 0.18;

interface SwipeState {
  id: number;
  x: number;
  y: number;
  lastX: number;
  lastAt: number;
  active: boolean;
}

// check if the touched element needs its own horizontal gesture
function blocksSwipe(target: EventTarget | null, screen: HTMLElement): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== screen) {
    if (node.matches('input, textarea, select, [role="slider"], [data-no-swipe-back]')) return true;
    const overflowX = getComputedStyle(node).overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth && node.scrollLeft > 0) return true;
    node = node.parentElement;
  }
  return false;
}

export function useSwipeBack({
  isOpen,
  onBack,
  disabled = false,
}: {
  isOpen: boolean;
  onBack: () => void;
  disabled?: boolean;
}) {
  const screenRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<SwipeState | null>(null);

  const paint = (offset: number, animated: boolean) => {
    const screen = screenRef.current;
    const dim = dimRef.current;
    if (!screen) return;
    const width = screen.offsetWidth || window.innerWidth;
    screen.style.transition = animated ? `transform ${SWIPE_SETTLE_MS}ms ${SWIPE_EASE}` : 'none';
    screen.style.transform = `translateX(${offset}px)`;
    screen.style.boxShadow = offset > 0 ? '-12px 0 32px rgba(0,0,0,0.18)' : '';
    if (dim) {
      dim.style.transition = animated ? `opacity ${SWIPE_SETTLE_MS}ms ${SWIPE_EASE}` : 'none';
      dim.style.opacity = String(SWIPE_DIM * (1 - Math.min(1, offset / width)));
    }
  };

  const release = () => {
    const screen = screenRef.current;
    const dim = dimRef.current;
    if (screen) {
      screen.style.transition = '';
      screen.style.transform = '';
      screen.style.boxShadow = '';
    }
    if (dim) {
      dim.style.transition = '';
      dim.style.opacity = '0';
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isOpen || disabled || event.pointerType === 'mouse') return;
    if (blocksSwipe(event.target, event.currentTarget)) return;
    swipeRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastAt: performance.now(),
      active: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.active) {
      if (Math.abs(dy) > SWIPE_START_PX && Math.abs(dy) > Math.abs(dx)) {
        swipeRef.current = null;
        return;
      }
      if (dx < SWIPE_START_PX || dx < Math.abs(dy) * 1.2) return;
      swipe.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    swipe.lastX = event.clientX;
    swipe.lastAt = performance.now();
    paint(Math.max(0, dx), false);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    swipeRef.current = null;
    if (!swipe || swipe.id !== event.pointerId || !swipe.active) return;
    const width = screenRef.current?.offsetWidth || window.innerWidth;
    const dx = Math.max(0, event.clientX - swipe.x);
    const speed = (event.clientX - swipe.lastX) / Math.max(1, performance.now() - swipe.lastAt);
    const close = event.type !== 'pointercancel' && (dx > width * SWIPE_CLOSE_RATIO || speed > SWIPE_CLOSE_SPEED);
    paint(close ? width : 0, true);
    window.setTimeout(() => {
      if (close) onBack();
      window.setTimeout(release, 50);
    }, SWIPE_SETTLE_MS);
  };

  const dim = (className: string): ReactNode => (
    <div ref={dimRef} aria-hidden="true" className={`pointer-events-none fixed inset-0 bg-black ${className}`} style={{ opacity: 0 }} />
  );

  return {
    screenRef,
    dim,
    swipeHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  };
}
