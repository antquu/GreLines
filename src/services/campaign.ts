import { supabase } from './supabase';
import { normalizeStopId, printableStopId } from './stopAliases';
import type { Stop } from '../types';

export interface CampaignVisit {
  source: string;
  stopId?: string;
  campaign?: string;
  medium?: string;
}

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
    stopId: normalizeStopId(stopId) ?? undefined,
    campaign: params.get('utm_campaign') || undefined,
    medium: params.get('utm_medium') || undefined,
  };
}

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
  }
}

export function buildCampaignUrl(
  stop: Stop | string,
  source: string,
  origin = 'https://grelines.fr',
): string {
  const url = new URL('/', origin);
  url.searchParams.set('utm_source', source);
  url.searchParams.set(
    'utm_stops',
    typeof stop === 'string' ? (normalizeStopId(stop) ?? stop) : printableStopId(stop),
  );
  return url.toString();
}
