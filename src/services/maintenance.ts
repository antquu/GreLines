import { useSyncExternalStore } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

export type MaintenanceMode = 'off' | 'banner' | 'lock';
export type MaintenanceStatus = 'investigating' | 'identified' | 'monitoring';

export interface MaintenanceConfig {
  mode: MaintenanceMode;
  title: string;
  message: string;
  status: MaintenanceStatus;
  startedAt: string | null;
}

export interface StatusIncident {
  id: string;
  title: string;
  status: MaintenanceStatus;
  body: string;
  startedAt: string | null;
}

export interface MaintenanceState {
  config: MaintenanceConfig;
  incident: StatusIncident | null;
}

export const MAINTENANCE_KEY = 'maintenance';
export const STATUS_URL = 'https://status.grelines.fr';

const OFF: MaintenanceConfig = { mode: 'off', title: '', message: '', status: 'investigating', startedAt: null };
const POLL_MS = 60_000;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const statusOf = (value: unknown): MaintenanceStatus =>
  value === 'identified' || value === 'monitoring' ? value : 'investigating';

export function parseMaintenance(value: unknown): MaintenanceConfig {
  if (!value || typeof value !== 'object') return OFF;
  const raw = value as Record<string, unknown>;
  const mode = raw.mode === 'banner' || raw.mode === 'lock' ? raw.mode : 'off';
  return { mode, title: text(raw.title), message: text(raw.message), status: statusOf(raw.status), startedAt: text(raw.startedAt) || null };
}

async function getMaintenance(): Promise<MaintenanceConfig | null> {
  if (!isSupabaseConfigured || !supabase) return OFF;
  try {
    const { data, error } = await supabase.from('site_config').select('value').eq('key', MAINTENANCE_KEY).maybeSingle();
    // a failed read keeps the last known state, the site never locks by accident
    if (error) return null;
    return parseMaintenance(data?.value);
  } catch {
    return null;
  }
}

async function getOpenIncident(): Promise<StatusIncident | null | undefined> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('status_incidents')
      .select('id, title, status, started_at')
      .is('resolved_at', null)
      .neq('status', 'resolved')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return undefined;
    if (!data) return null;
    const { data: update } = await supabase
      .from('status_incident_updates')
      .select('body')
      .eq('incident_id', data.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      id: String(data.id),
      title: text(data.title),
      status: statusOf(data.status),
      body: text(update?.body),
      startedAt: text(data.started_at) || null,
    };
  } catch {
    return undefined;
  }
}

let state: MaintenanceState | null = null;
const listeners = new Set<() => void>();
let stopWatching: (() => void) | null = null;
let channelSeq = 0;

function emit(next: MaintenanceState) {
  state = next;
  listeners.forEach(listener => listener());
}

function startWatching(): () => void {
  let stopped = false;
  const load = () => {
    void Promise.all([getMaintenance(), getOpenIncident()]).then(([config, incident]) => {
      if (stopped) return;
      const nextConfig = config ?? state?.config;
      if (!nextConfig) return;
      emit({ config: nextConfig, incident: incident === undefined ? state?.incident ?? null : incident });
    });
  };
  load();
  const timer = window.setInterval(load, POLL_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') load();
  };
  document.addEventListener('visibilitychange', onVisible);
  const channel = supabase
    ?.channel(`grelines-maintenance-${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'site_config', filter: `key=eq.${MAINTENANCE_KEY}` }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'status_incidents' }, load)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'status_incident_updates' }, load)
    .subscribe();

  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    if (channel) void supabase?.removeChannel(channel);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stopWatching) stopWatching = startWatching();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopWatching) {
      stopWatching();
      stopWatching = null;
    }
  };
}

export function useMaintenance(): MaintenanceState | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}

export function useMaintenanceBanner() {
  const maintenance = useMaintenance();
  return maintenance?.config.mode === 'banner' ? maintenance : null;
}

export function maintenanceText(current: MaintenanceState, fallback: string): { title: string; body: string } {
  const { config, incident } = current;
  if (incident) return { title: incident.title || config.title || fallback, body: incident.body || config.message };
  return { title: config.title || fallback, body: config.message };
}
