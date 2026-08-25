
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_NETWORK_CODES, NETWORKS } from '../services/api';

export interface PerfSettings {
  
  hideFooterTicker: boolean;

  devMode: boolean;
  
  devOverlay: boolean;

  stopLineBadges: boolean;
  
  stopLabels: boolean;
  
  lineShapes: boolean;
  
  animations: boolean;
  
  blurEffects: boolean;
  
  shadows: boolean;
  
  markerCap: number;

  /**
   * Le mode accessibilité.
   *
   * Il ne change pas ce que l'application sait, mais la place que ce savoir
   * prend. Le fauteuil quitte la fin du nom d'arrêt, où il tenait de la
   * ponctuation, pour devenir une pastille au-dessus du point : on la voit sans
   * lire, et l'on repère de loin les arrêts où l'on peut monter. Il ouvre aussi
   * les itinéraires accessibles, ci-dessous.
   */
  accessibility: boolean;

  /**
   * N'proposer que des itinéraires praticables en fauteuil.
   *
   * C'est le calculateur qui s'en charge : il écarte les correspondances par
   * escalier et les arrêts non repris. Distinct du mode ci-dessus, parce qu'on
   * peut vouloir l'un sans l'autre — repérer les arrêts accessibles sans
   * s'interdire un trajet, ou l'inverse. Le mode l'allume en s'allumant.
   */
  pmrRouting: boolean;

  networks: string[];

  citiz: boolean;
  
  voi: boolean;

  networksRevision: number;
}

export const NETWORKS_REVISION = 2;

export const DEFAULT_PERF_SETTINGS: PerfSettings = {
  hideFooterTicker: false,
  devMode: false,
  devOverlay: false,
  stopLineBadges: true,
  stopLabels: true,
  lineShapes: true,
  animations: true,
  blurEffects: true,
  shadows: true,
  markerCap: 0,
  accessibility: false,
  pmrRouting: false,
  networks: DEFAULT_NETWORK_CODES,
  citiz: true,
  voi: true,
  networksRevision: NETWORKS_REVISION,
};

const STORAGE_KEY = 'greLines_perfSettings_v1';

function readStoredSettings(): PerfSettings {
  if (typeof window === 'undefined') return DEFAULT_PERF_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PERF_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PerfSettings>;
    
    const merged = { ...DEFAULT_PERF_SETTINGS, ...parsed };
    
    if (!Array.isArray(merged.networks) || merged.networks.length === 0) {
      merged.networks = DEFAULT_NETWORK_CODES;
    }

    const storedRevision = typeof parsed.networksRevision === 'number'
      ? parsed.networksRevision
      : (Array.isArray(parsed.networks) && parsed.networks.length > 0 ? 1 : 0);
    if (storedRevision < NETWORKS_REVISION) {
      const known = new Set(merged.networks);
      const additions = NETWORKS.filter(network =>
        network.defaultEnabled &&
        (network.addedInRevision ?? 1) > storedRevision &&
        !known.has(network.code),
      ).map(network => network.code);
      merged.networks = [...merged.networks, ...additions];
      merged.networksRevision = NETWORKS_REVISION;
    }

    return merged;
  } catch {
    return DEFAULT_PERF_SETTINGS;
  }
}

interface PerfSettingsContextValue {
  settings: PerfSettings;
  setSetting: <K extends keyof PerfSettings>(key: K, value: PerfSettings[K]) => void;
  resetSettings: () => void;
}

const PerfSettingsContext = createContext<PerfSettingsContextValue>({
  settings: DEFAULT_PERF_SETTINGS,
  setSetting: () => {},
  resetSettings: () => {},
});

export function PerfSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PerfSettings>(readStoredSettings);

  const setSetting = useCallback(<K extends keyof PerfSettings>(key: K, value: PerfSettings[K]) => {
    setSettings(previous => ({ ...previous, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => setSettings(DEFAULT_PERF_SETTINGS), []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      
    }
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('perf-no-animations', !settings.animations);
    root.classList.toggle('perf-no-blur', !settings.blurEffects);
    root.classList.toggle('perf-no-shadows', !settings.shadows);
  }, [settings.animations, settings.blurEffects, settings.shadows]);

  const value = useMemo(
    () => ({ settings, setSetting, resetSettings }),
    [settings, setSetting, resetSettings],
  );

  return <PerfSettingsContext.Provider value={value}>{children}</PerfSettingsContext.Provider>;
}

export function usePerfSettings(): PerfSettingsContextValue {
  return useContext(PerfSettingsContext);
}
