import { useState } from 'react';
import { ChevronDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { stripHtml } from '../utils/stripHtml';
import { useTranslated } from '../hooks/useTranslated';
import { useOnScreen } from '../hooks/useOnScreen';
import { sortLinesByPriority } from '../utils/lineOrder';
import type { Line, TrafficDetail } from '../types';

export interface TrafficAlertCardProps {
  detail: TrafficDetail;
  language: 'fr' | 'en';
  lines?: Line[];
  heading?: string;
  defaultExpanded?: boolean;
  expandable?: boolean;
  isLight?: boolean;
}

export function TrafficAlertCard({
  detail,
  language,
  lines,
  heading,
  defaultExpanded = false,
  expandable = true,
  isLight = false,
}: TrafficAlertCardProps) {
  const isFr = language === 'fr';
  const [open, setOpen] = useState(defaultExpanded);
  const expanded = expandable ? open : true;

  const rawTitle = stripHtml(detail.titre ?? '').trim();
  const rawDescription = stripHtml(detail.description ?? '').trim();
  const [cardRef, onScreen] = useOnScreen<HTMLDivElement>();
  const title = useTranslated(rawTitle, language, onScreen) || (isFr ? 'Perturbation' : 'Disruption');
  const description = useTranslated(rawDescription, language, onScreen && expanded);
  const headingLabel = heading ?? (isFr ? 'Perturbation en cours' : 'Ongoing disruption');
  const sortedLines = lines && lines.length > 0 ? [...lines].sort(sortLinesByPriority) : [];
  const hasMore = Boolean(description) || Boolean(detail.dateFin) || sortedLines.length > 0;

  return (
    <div
      ref={cardRef}
      className={`overflow-hidden rounded-2xl border ${
        isLight ? 'border-amber-300 bg-amber-50' : 'border-amber-700 bg-amber-950'
      }`}
    >
      <button
        type="button"
        onClick={() => hasMore && expandable && setOpen(value => !value)}
        aria-expanded={hasMore && expandable ? expanded : undefined}
        disabled={!hasMore || !expandable}
        className={`w-full px-3 py-3 text-left transition ${
          hasMore && expandable
            ? isLight
              ? 'hover:bg-amber-100'
              : 'hover:bg-amber-900/30'
            : 'cursor-default'
        }`}
      >
        <div className="mb-1 flex items-center gap-2">
          <ExclamationTriangleIcon
            className={`h-4 w-4 flex-shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}
          />
          <p className={`min-w-0 flex-1 text-xs font-semibold ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
            {headingLabel}
          </p>
          {hasMore && expandable && (
            <ChevronDownIcon
              className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${
                isLight ? 'text-amber-600/70' : 'text-amber-400/70'
              } ${expanded ? 'rotate-180' : ''}`}
            />
          )}
        </div>
        <p className={`text-xs ${isLight ? 'text-amber-900' : 'text-amber-200'}`}>{title}</p>
      </button>

      {expanded && hasMore && (
        <div className="gl-fade px-3 pb-3">
          {description && (
            <p
              className={`whitespace-pre-line text-xs leading-relaxed ${
                isLight ? 'text-amber-800/80' : 'text-amber-300/70'
              }`}
            >
              {description}
            </p>
          )}
          {detail.dateFin && (
            <p className={`mt-1 text-xs ${isLight ? 'text-amber-700/70' : 'text-amber-400/60'}`}>
              {isFr ? 'Fin estimée' : 'Estimated end'} {detail.dateFin}
            </p>
          )}
          {sortedLines.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`text-xs ${isLight ? 'text-amber-700/70' : 'text-amber-300/60'}`}>
                {isFr ? 'Lignes' : 'Lines'}
              </span>
              {sortedLines.map(line => (
                <LineBadge
                  key={line.id}
                  line={{
                    id: line.id,
                    shortName: line.shortName || line.id,
                    color: line.color,
                    textColor: line.textColor,
                  }}
                  size="xs"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
