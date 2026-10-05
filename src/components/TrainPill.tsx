import type { Departure } from '../types';
import { SNCF_BRAND_COLORS, SNCF_TER_COLOR } from '../utils/lineColors';
import { TheoreticalPill } from './TheoreticalPill';
import { t } from '../i18n';

const KIND_STYLES: Record<string, { label: string; background: string }> = {
  TER: { label: 'TER', background: SNCF_TER_COLOR },
  TGV: { label: 'TGV INOUI', background: SNCF_BRAND_COLORS.TGV },
  IC: { label: 'Intercités', background: SNCF_BRAND_COLORS.IC },
  LEX: { label: 'Léman Express', background: '#C8102E' },
  OUIGO: { label: 'OUIGO', background: SNCF_BRAND_COLORS.OUIGO },
};

export function TrainPill({ number, kind, language }: { number: string; kind?: string; language: 'fr' | 'en' }) {
  const style = KIND_STYLES[kind ?? ''] ?? { label: kind || 'Train', background: '#475569' };
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded px-1.5 py-0.5 text-[0.625rem] font-bold leading-none tracking-[0.06em] text-white"
      style={{ backgroundColor: style.background }}
      title={t(language).train.pillTitle(style.label, number)}
    >
      {number}
    </span>
  );
}

export function departureTimeTone(departure: Departure): string | null {
  if (departure.cancelled) return 'text-red-500 line-through';
  if (departure.delayMinutes) return 'text-amber-400';
  return null;
}

export function DepartureStatusLabel({ departure, language }: { departure: Departure; language: 'fr' | 'en' }) {
  const text = t(language).train;
  if (departure.cancelled) {
    return <span className="block text-[0.6875rem] font-semibold leading-tight text-red-500">{text.cancelled}</span>;
  }
  if (!departure.delayMinutes) return null;
  return (
    <span className="block text-[0.6875rem] font-semibold leading-tight text-amber-400" title={text.late(departure.delayMinutes)}>
      {text.delayed} +{departure.delayMinutes}
    </span>
  );
}

export function DepartureTags({ departure, language }: { departure: Departure; language: 'fr' | 'en' }) {
  return (
    <>
      {departure.train && <TrainPill number={departure.train} kind={departure.trainKind} language={language} />}
      {departure.theoretical && <TheoreticalPill language={language} />}
    </>
  );
}
