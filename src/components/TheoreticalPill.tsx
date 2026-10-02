export function TheoreticalPill({ language }: { language: 'fr' | 'en' }) {
  const isFr = language === 'fr';
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded bg-slate-700 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase leading-none tracking-[0.06em] text-slate-300"
      title={isFr ? 'Horaire prévu, sans suivi en direct' : 'Scheduled time, not tracked live'}
    >
      {isFr ? 'Théorique' : 'Scheduled'}
    </span>
  );
}
