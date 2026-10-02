export type SiteId = 'grenoble' | 'nancy';

export const SITE: SiteId = import.meta.env.VITE_SITE === 'nancy' ? 'nancy' : 'grenoble';

export const IS_NANCY = SITE === 'nancy';
