import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  addDeparture,
  addNewGroup,
  closeLab,
  getLabState,
  passBus,
  resetLab,
  setLabSelectedLines,
  shiftFirst,
  subscribeLab,
  tickMinute,
} from '../dev/departureLab';

const POSITION_KEY = 'greLines_departureLabPosition';

function readPosition(): { x: number; y: number } {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null') as { x: number; y: number } | null;
    if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return parsed;
  } catch {
  }
  return { x: 12, y: 12 };
}

function Button({ onClick, children, active = false }: { onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-2 py-1 text-left transition active:scale-95"
      style={{
        backgroundColor: active ? 'rgba(59, 130, 246, 0.35)' : 'rgba(255, 255, 255, 0.08)',
        border: `1px solid ${active ? 'rgba(96, 165, 250, 0.8)' : 'rgba(255, 255, 255, 0.14)'}`,
        color: '#ffffff',
      }}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-white/15 px-2 py-2">
      <div className="mb-1.5" style={{ color: '#9ca3af' }}>{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function DepartureLabOverlay() {
  const lab = useSyncExternalStore(subscribeLab, getLabState);
  const [position, setPosition] = useState(readPosition);
  const [collapsed, setCollapsed] = useState(false);
  const [line, setLine] = useState<string>('');
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    } catch {
    }
  }, [position]);

  if (!lab.open || !lab.stop) return null;

  const lines = [...new Set(lab.stop.departures.map(dep => dep.lineId))];
  const target = line || undefined;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { dx: event.clientX - position.x, dy: event.clientY - position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const width = panelRef.current?.offsetWidth ?? 280;
    const x = Math.min(Math.max(0, event.clientX - drag.current.dx), window.innerWidth - width);
    const y = Math.min(Math.max(0, event.clientY - drag.current.dy), window.innerHeight - 40);
    setPosition({ x, y });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const toggleSort = (id: string) => {
    const next = new Set(lab.selectedLines);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLabSelectedLines(next);
  };

  return (
    <div
      ref={panelRef}
      className="fixed z-[10300] flex w-[280px] flex-col font-mono text-[0.6875rem] leading-[1.35]"
      style={{ left: position.x, top: position.y, backgroundColor: 'rgba(0, 0, 0, 0.82)', color: '#e5e7eb', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.45)' }}
      aria-label="Departure lab"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex cursor-grab touch-none select-none items-center justify-between px-2 py-1.5 active:cursor-grabbing"
        style={{ color: '#ffffff' }}
      >
        <span>DEPARTURE LAB · {lab.stop.name} · {lab.stop.departures.length} dep.</span>
        <span className="flex gap-1">
          <button type="button" onPointerDown={event => event.stopPropagation()} onClick={() => setCollapsed(value => !value)} className="px-1" aria-label="Collapse">
            {collapsed ? '+' : '–'}
          </button>
          <button type="button" onPointerDown={event => event.stopPropagation()} onClick={closeLab} className="px-1" aria-label="Close">×</button>
        </span>
      </div>

      {!collapsed && (
        <>
          <div className="flex items-center gap-1.5 border-t border-white/15 px-2 py-2">
            <span style={{ color: '#9ca3af' }}>Line</span>
            <select
              value={line}
              onChange={event => setLine(event.target.value)}
              className="flex-1 rounded px-1 py-0.5"
              style={{ backgroundColor: '#111827', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <option value="">Next (any line)</option>
              {lines.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>

          <Section title="DEPARTURES">
            <Button onClick={() => passBus(target)}>Bus passed</Button>
            <Button onClick={() => addDeparture(target)}>New departure</Button>
            <Button onClick={addNewGroup}>New destination</Button>
            <Button onClick={tickMinute}>Next minute</Button>
            <Button onClick={() => shiftFirst(3, target)}>Delay +3 min</Button>
            <Button onClick={() => shiftFirst(-2, target)}>Earlier -2 min</Button>
          </Section>

          <Section title="SORT BY LINE">
            {lines.map(id => (
              <Button key={id} active={lab.selectedLines.has(id)} onClick={() => toggleSort(id)}>{id}</Button>
            ))}
            <Button onClick={() => setLabSelectedLines(new Set())}>Show all</Button>
          </Section>

          <Section title="LAB">
            <Button onClick={resetLab}>Reset Chavant</Button>
            <Button onClick={closeLab}>Close</Button>
          </Section>
        </>
      )}
    </div>
  );
}
