import { useEffect, useRef, useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import type { TrafficDetail } from '../types';

export function DisruptionItem({ detail, lineKey }: { detail: TrafficDetail; lineKey?: string }) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!contentRef.current) return;
    setHeight(expanded ? contentRef.current.scrollHeight : 0);
  }, [expanded, detail]);

  const displayTitle = lineKey ? `${lineKey}: ${detail.titre || ''}` : detail.titre || '';


  return (
    <div className="flex gap-2 items-start p-3 rounded-xl">
      <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />

      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between gap-1"
        >
          <p className="text-xs font-semibold text-amber-300 text-left">{displayTitle || 'Perturbation'}</p>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`w-3 h-3 flex-shrink-0 text-amber-400/60 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div style={{ height, overflow: 'hidden', transition: 'height 0.2s ease' }}>
          <div ref={contentRef} className="mt-1 space-y-1">
            {detail.description ? (
              <p className="text-xs text-amber-200 whitespace-pre-line">{detail.description}</p>
            ) : (
              <p className="text-xs text-amber-200">{detail.titre || 'Détails indisponibles'}</p>
            )}
            {detail.dateFin ? (
              <p className="text-xs text-amber-400/60">Fin estimée {detail.dateFin}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
