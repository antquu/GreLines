/**
 * Les campagnes d'affichage.
 *
 * Une affiche collée dans un abribus porte l'adresse de l'arrêt où elle se
 * trouve :
 *
 *   grelines.fr/?utm_source=abribus&utm_stops=SEM:CHAVANT
 *
 * Le paramètre `utm_stops` ouvre l'arrêt à l'arrivée, et `utm_source` dit d'où
 * l'on vient. La visite est comptée une fois, puis les paramètres sont retirés
 * de la barre d'adresse : rechargée ou partagée, la page ne recompte pas.
 *
 * On ne retient que la source, l'arrêt et l'instant. Ni adresse IP, ni
 * identifiant d'appareil : on mesure une affiche, pas des gens.
 */

import { supabase } from './supabase';

export interface CampaignVisit {
  source: string;
  stopId?: string;
  campaign?: string;
  medium?: string;
}

/**
 * Lit les paramètres de campagne d'une URL.
 *
 * `utm_stops` accepte les deux graphies qu'on trouve sur les affiches : celle
 * en bonne et due forme (`utm_stops=SEM:CHAVANT`) et celle où le signe égal a
 * été remplacé par deux points à l'impression (`utm_stops:SEM:CHAVANT`), qui
 * arrive dans la requête comme une clé sans valeur.
 */
export function readCampaign(search: string): CampaignVisit | null {
  const params = new URLSearchParams(search);
  const source = params.get('utm_source');
  if (!source) return null;

  let stopId = params.get('utm_stops') || params.get('utm_stop') || undefined;
  if (!stopId) {
    for (const key of params.keys()) {
      const match = /^utm_stops?:(.+)$/i.exec(key);
      if (match) {
        stopId = match[1];
        break;
      }
    }
  }

  return {
    source,
    stopId: stopId || undefined,
    campaign: params.get('utm_campaign') || undefined,
    medium: params.get('utm_medium') || undefined,
  };
}

/** Enregistre la visite. L'échec est sans conséquence : on ne compte pas, voilà tout. */
export async function recordCampaignVisit(visit: CampaignVisit): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('campaign_hits').insert({
      source: visit.source,
      stop_id: visit.stopId ?? null,
      campaign: visit.campaign ?? null,
      medium: visit.medium ?? null,
    });
  } catch {
    // Un compteur manqué ne doit jamais empêcher la page de s'ouvrir.
  }
}

/** L'adresse à imprimer sur une affiche, pour un arrêt et une source donnés. */
export function buildCampaignUrl(stopId: string, source: string, origin = 'https://grelines.fr'): string {
  const url = new URL('/', origin);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_stops', stopId);
  return url.toString();
}
