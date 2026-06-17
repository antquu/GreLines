import { useEffect, useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';

interface BetaNoticeConfig {
  enabled?: boolean;
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

const fallbackConfig: Required<BetaNoticeConfig> = {
  enabled: true,
  title: 'Version beta developpeur',
  description: 'Vous utilisez une version beta developpeur de GreLines. Certaines fonctionnalites peuvent comporter des bugs.',
  ctaLabel: 'Signaler un bug',
  ctaUrl: 'https://github.com/antquu/GreLines/issues/new',
};

export function BetaNotice({ compact = false }: { compact?: boolean }) {
  const [config, setConfig] = useState<Required<BetaNoticeConfig>>(fallbackConfig);

  useEffect(() => {
    let active = true;
    fetch('/beta.json', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then((data: BetaNoticeConfig | null) => {
        if (!active || !data) return;
        setConfig({ ...fallbackConfig, ...data });
      })
      .catch(() => {
        if (active) setConfig(fallbackConfig);
      });
    return () => { active = false; };
  }, []);

  if (!config.enabled) return null;

  return (
    <div className={`rounded-2xl border border-amber-500/30 bg-amber-500/10 ${compact ? 'p-3' : 'p-4'} text-left`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-400/15">
          <ExclamationTriangleIcon className="h-4 w-4 text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-amber-100">{config.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/75">{config.description}</p>
          <a
            href={config.ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/15 px-3 py-1.5 text-xs font-bold text-amber-100 transition hover:bg-amber-300/25"
          >
            {config.ctaLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
