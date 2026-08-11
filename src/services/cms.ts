import { supabase, isSupabaseConfigured } from './supabase';

export interface CmsPopup {
  id: string;
  type: 'promo' | 'infotraffic';
  title: string;
  message: string;
  image_url: string | null;
  link_url: string | null;
  target_scope: 'global' | 'line' | 'stop';
  target_id: string | null;
  priority: number;
}






export async function getActivePopups(context?: { lineId?: string; stopId?: string }): Promise<CmsPopup[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('popups')
      .select('id, type, title, message, image_url, link_url, target_scope, target_id, priority')
      .order('priority', { ascending: false });

    if (error || !data) return [];

    return (data as CmsPopup[]).filter((popup) => {
      if (popup.target_scope === 'global') return true;
      if (popup.target_scope === 'line') return popup.target_id === context?.lineId;
      if (popup.target_scope === 'stop') return popup.target_id === context?.stopId;
      return false;
    });
  } catch {
    return [];
  }
}

export interface TripSurveyAnswers {
  lineId: string;
  
  boardingStop?: string | null;
  
  boardingTime?: string | null;
  cleanliness?: number;
  punctuality?: number;
  crowding?: number;
  comfort?: number;
  onTime?: boolean;
  comment?: string;
}







export async function submitTripSurvey(answers: TripSurveyAnswers): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { error } = await supabase.from('trip_surveys').insert({
      line_id: answers.lineId,
      boarding_stop: answers.boardingStop ?? null,
      boarding_time: answers.boardingTime ?? null,
      cleanliness: answers.cleanliness ?? null,
      punctuality: answers.punctuality ?? null,
      crowding: answers.crowding ?? null,
      comfort: answers.comfort ?? null,
      on_time: answers.onTime ?? null,
      comment: answers.comment?.trim() || null,
    });
    return !error;
  } catch {
    return false;
  }
}

export interface StopOverrideEntry {
  stop_id: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
  hidden: boolean;
}

export interface LineOverrideEntry {
  line_id: string;
  short_name: string | null;
  long_name: string | null;
  color: string | null;
  text_color: string | null;
  hidden: boolean;
}





export async function getStopOverrides(): Promise<Map<string, StopOverrideEntry>> {
  if (!isSupabaseConfigured || !supabase) return new Map();

  try {
    const { data, error } = await supabase.from('stop_overrides').select('*');
    if (error || !data) return new Map();
    return new Map((data as StopOverrideEntry[]).map((o) => [o.stop_id, o]));
  } catch {
    return new Map();
  }
}






export async function getLineOverrides(): Promise<Map<string, LineOverrideEntry>> {
  if (!isSupabaseConfigured || !supabase) return new Map();

  try {
    const { data, error } = await supabase.from('line_overrides').select('*');
    if (error || !data) return new Map();

    const map = new Map<string, LineOverrideEntry>();
    for (const entry of data as LineOverrideEntry[]) {
      const id = entry.line_id.toUpperCase().trim();
      map.set(id, entry);
      map.set(id.replace(/^SEM[:_]/, ''), entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

export interface FooterConfig {
  message: string | null;
  color: string;
  showClock: boolean;
}






export function subscribeToCmsChanges(onChange: () => void): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};

  const channel = supabase
    .channel('grelines-cms')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'site_config' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'popups' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stop_overrides' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'line_overrides' }, onChange)
    .subscribe();

  return () => {
    supabase?.removeChannel(channel);
  };
}

const DEFAULT_FOOTER: FooterConfig = { message: null, color: '#fbbf24', showClock: true };






export async function getFooterConfig(): Promise<FooterConfig> {
  if (!isSupabaseConfigured || !supabase) return DEFAULT_FOOTER;

  try {
    const { data, error } = await supabase
      .from('site_config')
      .select('key, value')
      .in('key', ['footer_message', 'footer_color', 'footer_show_clock']);

    if (error || !data) return DEFAULT_FOOTER;

    const values = new Map(data.map((row: { key: string; value: unknown }) => [row.key, row.value]));
    const rawMessage = values.get('footer_message');
    const rawColor = values.get('footer_color');
    const rawShowClock = values.get('footer_show_clock');

    return {
      message: typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage : null,
      color: typeof rawColor === 'string' && rawColor ? rawColor : DEFAULT_FOOTER.color,
      showClock: typeof rawShowClock === 'boolean' ? rawShowClock : true
    };
  } catch {
    return DEFAULT_FOOTER;
  }
}
