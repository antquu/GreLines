


















import { idbGet, idbSet } from './persistentCache';
import type { SharedOperator } from './sharedMobility';

const GBFS_BASE = 'https://data.mobilites-m.fr/api/gbfs';

const PRODUCERS: Record<SharedOperator, string> = {
  citiz: 'citiz_grenoble',
  voi: 'voi_grenoble',
};


const PRICING_TTL_MS = 24 * 60 * 60 * 1000;

export interface SharedPricing {
  operator: SharedOperator;
  
  unlockPrice: number | null;
  
  usageRate: number | null;
  usageIntervalMinutes: number;
  
  perKmRate: number | null;
  
  planName: string | null;
}

interface RawTier {
  start?: number;
  rate?: number;
  interval?: number;
}

interface RawPlan {
  plan_id?: string;
  
  name?: string | Array<{ text?: string }>;
  price?: number;
  per_min_pricing?: RawTier[];
  per_km_pricing?: RawTier[];
}

function planName(plan: RawPlan): string | null {
  const raw = typeof plan.name === 'string'
    ? plan.name
    : Array.isArray(plan.name) ? plan.name[0]?.text ?? null : null;
  if (!raw) return null;
  
  
  if (!raw.includes(' ')) return null;
  return raw;
}







function pickPlan(plans: RawPlan[], formFactor: string): RawPlan | null {
  if (plans.length === 0) return null;
  const wanted = formFactor === 'bicycle' ? 'bike' : formFactor;
  const matched = plans.find(plan => String(plan.plan_id ?? '').includes(wanted));
  return matched ?? plans[0];
}

export async function getSharedPricing(
  operator: SharedOperator,
  formFactor: string,
): Promise<SharedPricing | null> {
  const cacheKey = `sharedPricing_v1_${operator}`;

  let plans: RawPlan[] | null = null;
  const cached = await idbGet<RawPlan[]>(cacheKey);
  if (cached?.value) {
    plans = cached.value;
  } else {
    try {
      const response = await fetch(`${GBFS_BASE}/${PRODUCERS[operator]}/system_pricing_plans`);
      if (!response.ok) return null;
      const payload = await response.json();
      plans = payload?.data?.plans ?? null;
      if (plans) void idbSet(cacheKey, plans, PRICING_TTL_MS);
    } catch {
      return null;
    }
  }

  if (!plans || plans.length === 0) return null;

  const plan = pickPlan(plans, formFactor);
  if (!plan) return null;

  // Première tranche seulement : les suivantes décrivent des locations de
  // plusieurs jours, hors sujet quand on choisit un véhicule dans la rue.
  const minuteTier = plan.per_min_pricing?.[0];
  const kmTier = plan.per_km_pricing?.[0];

  return {
    operator,
    unlockPrice: typeof plan.price === 'number' && plan.price > 0 ? plan.price : null,
    usageRate: typeof minuteTier?.rate === 'number' ? minuteTier.rate : null,
    // Un intervalle nul signale une tranche forfaitaire : on la ramène à la
    // minute pour ne pas afficher « par 0 minute ».
    usageIntervalMinutes: minuteTier?.interval && minuteTier.interval > 0 ? minuteTier.interval : 1,
    perKmRate: typeof kmTier?.rate === 'number' ? kmTier.rate : null,
    planName: planName(plan),
  };
}

/** Formate un montant en euros, à la française (« 0,49 € »). */
export function formatEuro(amount: number, language: 'fr' | 'en'): string {
  return new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}
