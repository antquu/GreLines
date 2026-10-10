const SITE_NETWORKS = { nancy: 'STAN', lyon: 'TCL', 'saint-etienne': 'STAS', clermont: 'T2C' };

export const SITE = process.env.VITE_SITE in SITE_NETWORKS ? process.env.VITE_SITE : 'grenoble';

export const SITE_NETWORK = SITE_NETWORKS[SITE] ?? null;
