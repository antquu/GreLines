import { useEffect, useState } from 'react';

const twoDigits = (value: number) => String(value).padStart(2, '0');

export function ScreenTopBar({ stopName }: { stopName?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="flex h-14 flex-shrink-0 items-center gap-3 bg-[#0f172a] px-4 text-white 2xl:h-16 2xl:gap-4 2xl:px-6">
      <a href="/app" className="flex flex-shrink-0 items-center no-underline" title="Ouvrir GreLines">
        {

}
        <img src="/assets/GreLinesWordmark.png" alt="GreLines" className="h-4 w-auto 2xl:h-6" />
      </a>

      {
}
      {

}
      <div className="min-w-0 flex-1 text-center text-xl font-bold leading-tight 2xl:text-3xl">
        {stopName && <h1 className="truncate text-white">{stopName}</h1>}
      </div>

      <div className="flex flex-shrink-0 items-baseline gap-1">
        <span className="tabular text-xl font-bold text-white 2xl:text-3xl">
          {twoDigits(now.getHours())}:{twoDigits(now.getMinutes())}
        </span>
        <span className="tabular text-sm font-semibold text-slate-500 2xl:text-lg">
          {twoDigits(now.getSeconds())}
        </span>
      </div>
    </header>
  );
}
