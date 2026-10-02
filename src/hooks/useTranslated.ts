import { useEffect, useState } from 'react';
import { cachedTranslation, requestTranslation, subscribeTranslations } from '../services/translation';

export function useTranslated(
  text: string | null | undefined,
  language: 'fr' | 'en',
  enabled: boolean = true,
): string {
  const source = String(text ?? '');
  const [, bump] = useState(0);

  useEffect(() => {
    if (!enabled || language === 'fr' || !source.trim()) return;
    requestTranslation(source, language);
    return subscribeTranslations(() => bump(n => n + 1));
  }, [source, language, enabled]);

  if (language === 'fr') return source;
  return cachedTranslation(source, language) ?? source;
}
