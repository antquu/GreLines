import { useEffect, useState } from 'react';
import { SignalIcon } from '@heroicons/react/24/solid';

const isNetworkClosed = (date: Date) => {
  const totalMinutes = date.getHours() * 60 + date.getMinutes();
  return totalMinutes >= 60 && totalMinutes < 270;
};

export function ClockSignal({
  closedLabel,
}: {
  closedLabel: string;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 h-10 bg-gray-900 border-t border-gray-800 z-50 shadow-lg">
      {isNetworkClosed(now) ? (
        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-red-300">
          {closedLabel}
        </div>
      ) : (
        <div className="h-full flex items-center justify-end px-4">
          <div className="flex items-center gap-1.5">
            <SignalIcon className={`w-4 h-4 transition-colors duration-300 ${now.getSeconds() % 2 === 0 ? 'text-blue-600' : 'text-white'}`} />
            <p className="text-white font-mono font-medium text-xs">
              {now.toLocaleTimeString('fr-FR')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
