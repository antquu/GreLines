import { useEffect, useState } from 'react';

const twoDigits = (value: number) => String(value).padStart(2, '0');

export function ScreenTopBar({ stopName, subtitle, isStation = false }: { stopName?: string; subtitle?: string; isStation?: boolean }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="flex flex-shrink-0 items-end gap-6 px-8 pb-5 pt-7 2xl:px-12 2xl:pb-7 2xl:pt-10">
      <div className="min-w-0 flex-1">
        {stopName ? (
          <>
            <p className="flex items-center gap-2 text-base font-medium text-neutral-500 2xl:text-xl">
              {isStation && <img src="/assets/sncf-reseau.svg" alt="" className="h-4 w-auto 2xl:h-5" />}
              <span className="truncate">{subtitle}</span>
            </p>
            <p role="heading" aria-level={1} className="truncate pt-1 text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-black 2xl:text-[4.25rem]">
              {stopName}
            </p>
          </>
        ) : null}
      </div>

      <div className="flex flex-shrink-0 items-baseline gap-1.5">
        <span className="tabular text-[2.75rem] font-semibold leading-none tracking-tight text-black 2xl:text-[4.25rem]">
          {twoDigits(now.getHours())}:{twoDigits(now.getMinutes())}
        </span>
        <span className="tabular w-8 text-xl font-medium text-neutral-400 2xl:w-12 2xl:text-3xl">{twoDigits(now.getSeconds())}</span>
      </div>
    </header>
  );
}
