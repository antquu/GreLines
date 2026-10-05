import { tx } from '../i18n';
export function LastRunRibbon({ language }: { language: 'fr' | 'en' }) {
  return (
    <span className="inline-flex items-center rounded bg-amber-300 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase leading-none tracking-[0.06em] text-orange-700">
      {tx(language === 'fr').lastRunRibbon.last}
    </span>
  );
}

export const LAST_RUN_TEXT = 'text-white';
