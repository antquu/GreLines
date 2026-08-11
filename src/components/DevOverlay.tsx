import { useEffect, useRef, useState } from 'react';
import { usePerfSettings } from '../hooks/usePerfSettings';














const JANK_FRAME_MS = 50;

interface Stats {
  fps: number;
  minFps: number;
  worstFrameMs: number;
  jankPerSec: number;
  memoryMb: number | null;
  memoryLimitMb: number | null;
  domNodes: number;
  markers: number;
  requests: number;
  transferredKb: number;
  longTasks: number;
}

const EMPTY_STATS: Stats = {
  fps: 0,
  minFps: 0,
  worstFrameMs: 0,
  jankPerSec: 0,
  memoryMb: null,
  memoryLimitMb: null,
  domNodes: 0,
  markers: 0,
  requests: 0,
  transferredKb: 0,
  longTasks: 0,
};

export function DevOverlay() {
  const { settings } = usePerfSettings();
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [history, setHistory] = useState<number[]>([]);
  const longTasksRef = useRef(0);

  const enabled = settings.devMode && settings.devOverlay;
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPointerId, setDragPointerId] = useState<number | null>(null);
  const dragOriginRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const prevUserSelectRef = useRef<string>('');
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (position !== null) return;
    const width = 224; 
    const x = Math.max(12, window.innerWidth - width - 12);
    setPosition({ x, y: 12 });
  }, [enabled, position]);

  useEffect(() => {
    if (!enabled || !position) return;

    const startDragIfOnOverlay = (event: PointerEvent) => {
      if (dragPointerId !== null) return;
      if (!overlayRef.current) return;

      const { left, top, right, bottom } = overlayRef.current.getBoundingClientRect();
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) return;

      dragOriginRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startLeft: position.x,
        startTop: position.y,
      };
      setDragPointerId(event.pointerId);
    };

    const updatePosition = (event: PointerEvent) => {
      if (dragPointerId === null || !dragOriginRef.current || event.pointerId !== dragPointerId) return;
      const deltaX = event.clientX - dragOriginRef.current.startX;
      const deltaY = event.clientY - dragOriginRef.current.startY;
      const nextX = Math.max(12, dragOriginRef.current.startLeft + deltaX);
      const nextY = Math.max(12, dragOriginRef.current.startTop + deltaY);
      if (!isDragging) {
        const moved = Math.hypot(deltaX, deltaY);
        if (moved < 3) return;
        setIsDragging(true);
        prevUserSelectRef.current = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
      }
      setPosition({ x: nextX, y: nextY });
      event.preventDefault();
    };

    const stopDragging = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) return;
      setIsDragging(false);
      setDragPointerId(null);
      dragOriginRef.current = null;
      document.body.style.userSelect = prevUserSelectRef.current || '';
    };

    window.addEventListener('pointerdown', startDragIfOnOverlay, true);
    window.addEventListener('pointermove', updatePosition);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    window.addEventListener('blur', () => {
      if (dragPointerId !== null) {
        setIsDragging(false);
        setDragPointerId(null);
        dragOriginRef.current = null;
        document.body.style.userSelect = prevUserSelectRef.current || '';
      }
    });

    return () => {
      window.removeEventListener('pointerdown', startDragIfOnOverlay, true);
      window.removeEventListener('pointermove', updatePosition);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      window.removeEventListener('blur', () => {
        if (dragPointerId !== null) {
          setIsDragging(false);
          setDragPointerId(null);
          dragOriginRef.current = null;
          document.body.style.userSelect = prevUserSelectRef.current || '';
        }
      });
    };
  }, [enabled, position, dragPointerId, isDragging]);

  
  
  
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (enabled) {
      setStats(EMPTY_STATS);
      setHistory([]);
      setPosition(null);
    }
  }

  
  
  useEffect(() => {
    if (!enabled || typeof PerformanceObserver === 'undefined') return;
    
    longTasksRef.current = 0;
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver(list => {
        longTasksRef.current += list.getEntries().length;
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      
    }
    return () => observer?.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let rafId = 0;
    let frames = 0;
    let jank = 0;
    let worstFrame = 0;
    let lastFrameTime = performance.now();
    let windowStart = lastFrameTime;

    const tick = (now: number) => {
      const frameMs = now - lastFrameTime;
      lastFrameTime = now;
      frames += 1;
      if (frameMs > worstFrame) worstFrame = frameMs;
      if (frameMs > JANK_FRAME_MS) jank += 1;

      const elapsed = now - windowStart;
      if (elapsed >= 1000) {
        const fps = Math.round((frames * 1000) / elapsed);
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const transferred = resources.reduce((total, entry) => total + (entry.transferSize || 0), 0);
        const memory = (performance as Performance & {
          memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
        }).memory;

        const nextStats: Stats = {
          fps,
          minFps: worstFrame > 0 ? Math.round(1000 / worstFrame) : fps,
          worstFrameMs: Math.round(worstFrame),
          jankPerSec: jank,
          memoryMb: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
          memoryLimitMb: memory ? Math.round(memory.jsHeapSizeLimit / 1048576) : null,
          domNodes: document.getElementsByTagName('*').length,
          markers: document.querySelectorAll('.maplibregl-marker').length,
          requests: resources.length,
          transferredKb: Math.round(transferred / 1024),
          longTasks: longTasksRef.current,
        };

        setStats(nextStats);
        setHistory(previous => [...previous.slice(-59), fps]);

        frames = 0;
        jank = 0;
        worstFrame = 0;
        windowStart = now;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);

  if (!enabled) return null;

  const fpsColor = stats.fps >= 50 ? '#4ade80' : stats.fps >= 30 ? '#facc15' : '#f87171';
  const peak = Math.max(60, ...history);

  if (!position) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed z-[10001] w-56 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-200 shadow-lg backdrop-blur-sm"
      aria-hidden="true"
      style={{ left: position.x, top: position.y, pointerEvents: 'none' }}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate-400"> </span>
        <span className="text-lg font-bold" style={{ color: fpsColor }}>
          {stats.fps} <span className="text-[10px] font-normal text-slate-400">fps</span>
        </span>
      </div>

      {}
      <div className="mb-2 flex h-8 items-end gap-[1px]" style={{ pointerEvents: 'none' }}>
        {history.map((value, index) => (
          <div
            key={index}
            className="flex-1 rounded-sm"
            style={{
              height: `${Math.max(4, (value / peak) * 100)}%`,
              backgroundColor: value >= 50 ? '#4ade80' : value >= 30 ? '#facc15' : '#f87171',
              opacity: 0.75,
            }}
          />
        ))}
      </div>

      <Line label="image la pire" value={`${stats.worstFrameMs} ms`} warn={stats.worstFrameMs > JANK_FRAME_MS} />
      <Line label="saccades /s" value={String(stats.jankPerSec)} warn={stats.jankPerSec > 0} />
      <Line label="tâches longues" value={String(stats.longTasks)} warn={stats.longTasks > 0} />
      {stats.memoryMb !== null && (
        <Line label="mémoire JS" value={`${stats.memoryMb} / ${stats.memoryLimitMb} Mo`} />
      )}
      {/* Les arrêts sont dessinés par le GPU : ce compteur ne suit que les
          marqueurs HTML restants (étiquettes, position, itinéraire). */}
      <Line label="marqueurs DOM" value={String(stats.markers)} warn={stats.markers > 120} />
      <Line label="nœuds DOM" value={String(stats.domNodes)} warn={stats.domNodes > 5000} />
      <Line label="requêtes" value={String(stats.requests)} />
      <Line label="transféré" value={`${stats.transferredKb} ko`} />
    </div>
  );
}

function Line({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className={warn ? 'text-amber-300' : 'text-slate-100'}>{value}</span>
    </div>
  );
}
