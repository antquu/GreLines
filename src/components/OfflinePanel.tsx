import { IoWifi } from 'react-icons/io5';
import { tx } from '../i18n';

export function OfflinePanel({
  language,
  isLight = false,
  detail,
}: {
  language: 'fr' | 'en';
  isLight?: boolean;
  detail?: string;
}) {
  const isFr = language === 'fr';
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <IoWifi className={isLight ? 'text-slate-300' : 'text-slate-700'} size={96} aria-hidden="true" />
      <div className="mt-6">
        <p className={`text-xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
          {tx(isFr).offlinePanel.noConnection}
        </p>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          {detail ?? (tx(isFr).offlinePanel.thisInformationComesLive)}
        </p>
      </div>
    </div>
  );
}
