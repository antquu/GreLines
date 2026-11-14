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

export const MAINTENANCE_KEY = 'maintenance';
export const STATUS_URL = 'https://status.grelines.fr';

const OFF: MaintenanceConfig = { mode: 'off', title: '', message: '', status: 'investigating', startedAt: null };
const POLL_MS = 60_000;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function parseMaintenance(value: unknown): MaintenanceConfig {
  if (!value || typeof value !== 'object') return OFF;
  const raw = value as Record<string, unknown>;
  const mode = raw.mode === 'banner' || raw.mode === 'lock' ? raw.mode : 'off';
  const status = raw.status === 'identified' || raw.status === 'monitoring' ? raw.status : 'investigating';
  return { mode, title: text(raw.title), message: text(raw.message), status, startedAt: text(raw.startedAt) || null };
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

export function watchMaintenance(onChange: (config: MaintenanceConfig) => void): () => void {
  let stopped = false;
  const load = () => {
    void getMaintenance().then(config => {
      if (!stopped && config) onChange(config);
    });
  };
  load();
  const timer = window.setInterval(load, POLL_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') load();
  };
  document.addEventListener('visibilitychange', onVisible);
  const channel = supabase
    ?.channel('grelines-maintenance')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'site_config', filter: `key=eq.${MAINTENANCE_KEY}` }, load)
    .subscribe();

  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    if (channel) void supabase?.removeChannel(channel);
  };
}
