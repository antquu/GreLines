






export function LastRunRibbon({ language }: { language: 'fr' | 'en' }) {
  return (
    <span className="signal-label inline-flex items-center rounded-md bg-amber-400 px-1.5 py-0.5 text-slate-900">
      {language === 'fr' ? 'Dernier passage' : 'Last run'}
    </span>
  );
}
