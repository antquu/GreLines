import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MapPinIcon,
  MagnifyingGlassIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  ArrowsRightLeftIcon,
  HomeIcon,
} from '@heroicons/react/24/solid';
import type { AllLinesLine } from '../services/allLines';
import type { Stop, TrafficDetail } from '../types';
import type { AddressResult } from '../services/geocoding';
import { searchAddresses } from '../services/geocoding';
import { LineBadge } from './LineBadge';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

export type SpotlightResult =
  | { kind: 'stop'; id: string; title: string; subtitle: string; stop: Stop }
  | { kind: 'line'; id: string; title: string; subtitle: string; line: AllLinesLine }
  | { kind: 'address'; id: string; title: string; subtitle: string; address: AddressResult }
  | { kind: 'traffic'; id: string; title: string; subtitle: string; lineName: string }
  | { kind: 'action'; id: string; title: string; subtitle: string; run: () => void };

interface SpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'fr' | 'en';
  stops: Stop[];
  lines: AllLinesLine[];
  trafficInfo: Map<string, TrafficDetail[]>;
  onSelectStop: (stop: Stop) => void;
  onSelectLine: (line: AllLinesLine) => void;
  onSelectAddress: (address: AddressResult) => void;
  onOpenSettings: (tab?: string) => void;
  onOpenTraffic: () => void;
  onPlanRoute: () => void;
  onOpenNearby: () => void;
}

const MAX_PER_GROUP = 5;

const EMPTY_ADDRESSES: AddressResult[] = [];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function Spotlight({
  isOpen,
  onClose,
  language,
  stops,
  lines,
  trafficInfo,
  onSelectStop,
  onSelectLine,
  onSelectAddress,
  onOpenSettings,
  onOpenTraffic,
  onPlanRoute,
  onOpenNearby,
}: SpotlightProps) {
  const isFr = language === 'fr';
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  
  const [addressHit, setAddressHit] = useState<{ query: string; results: AddressResult[] }>({
    query: '',
    results: [],
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(query, 250);

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!isOpen || trimmed.length < 3) return;

    const controller = new AbortController();
    let active = true;
    searchAddresses(trimmed, { limit: 4, signal: controller.signal })
      .then(results => { if (active) setAddressHit({ query: trimmed, results }); })
      .catch(() => { if (active) setAddressHit({ query: trimmed, results: [] }); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedQuery, isOpen]);

  const addresses = useMemo(
    () => (addressHit.query === debouncedQuery.trim() ? addressHit.results : EMPTY_ADDRESSES),
    [addressHit, debouncedQuery],
  );

  const actions = useMemo<SpotlightResult[]>(() => [
    {
      kind: 'action' as const,
      id: 'action-settings',
      title: isFr ? 'Ouvrir les réglages' : 'Open settings',
      subtitle: isFr ? 'Réglages' : 'Settings',
      run: () => onOpenSettings(),
    },
    {
      kind: 'action' as const,
      id: 'action-settings-display',
      title: isFr ? 'Réglages : Affichage' : 'Settings: Display',
      subtitle: isFr ? 'Thème, taille du texte, footer' : 'Theme, text size, footer',
      run: () => onOpenSettings('display'),
    },
    {
      kind: 'action' as const,
      id: 'action-settings-data',
      title: isFr ? 'Réglages : Données' : 'Settings: Data',
      subtitle: isFr ? 'Actualisation, cache' : 'Refresh, cache',
      run: () => onOpenSettings('data'),
    },
    {
      kind: 'action' as const,
      id: 'action-traffic',
      title: isFr ? 'Infos trafic en direct' : 'Live traffic info',
      subtitle: isFr ? 'Perturbations du réseau' : 'Network disruptions',
      run: onOpenTraffic,
    },
    {
      kind: 'action' as const,
      id: 'action-route',
      title: isFr ? 'Planifier un itinéraire' : 'Plan a route',
      subtitle: isFr ? 'Itinéraire' : 'Route planner',
      run: onPlanRoute,
    },
    {
      kind: 'action' as const,
      id: 'action-nearby',
      title: isFr ? 'Arrêts à proximité' : 'Nearby stops',
      subtitle: isFr ? 'Autour de moi' : 'Around me',
      run: onOpenNearby,
    },
  ], [isFr, onOpenSettings, onOpenTraffic, onPlanRoute, onOpenNearby]);

  const results = useMemo<SpotlightResult[]>(() => {
    const q = normalize(query);

    if (!q) return actions;

    const matchedLines: SpotlightResult[] = lines
      .filter(line => {
        const short = normalize(line.shortName);
        return short === q || short.startsWith(q) || normalize(line.longName).includes(q);
      })
      
      .sort((a, b) => {
        const aExact = normalize(a.shortName) === q ? 0 : 1;
        const bExact = normalize(b.shortName) === q ? 0 : 1;
        return aExact - bExact || a.shortName.localeCompare(b.shortName, 'fr', { numeric: true });
      })
      .slice(0, MAX_PER_GROUP)
      .map(line => ({
        kind: 'line' as const,
        id: `line-${line.id}`,
        title: `${isFr ? 'Ligne' : 'Line'} ${line.shortName}`,
        subtitle: line.longName,
        line,
      }));

    const matchedStops: SpotlightResult[] = stops
      .filter(stop => normalize(stop.name).includes(q) || normalize(stop.city || '').includes(q))
      .sort((a, b) => {
        const aStarts = normalize(a.name).startsWith(q) ? 0 : 1;
        const bStarts = normalize(b.name).startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name, 'fr');
      })
      .slice(0, MAX_PER_GROUP)
      .map(stop => ({
        kind: 'stop' as const,
        id: `stop-${stop.id}`,
        title: stop.name,
        subtitle: stop.city || (isFr ? 'Arrêt' : 'Stop'),
        stop,
      }));

    const matchedTraffic: SpotlightResult[] = Array.from(trafficInfo.entries())
      .filter(([lineName, details]) =>
        normalize(lineName).includes(q) ||
        details.some(detail => normalize(detail.titre).includes(q)))
      .slice(0, MAX_PER_GROUP)
      .map(([lineName, details]) => ({
        kind: 'traffic' as const,
        id: `traffic-${lineName}`,
        title: details[0]?.titre || lineName,
        subtitle: `${isFr ? 'Infotrafic' : 'Traffic'} · ${lineName}`,
        lineName,
      }));

    const matchedAddresses: SpotlightResult[] = addresses.map(address => ({
      kind: 'address' as const,
      id: `address-${address.label}`,
      title: address.name || address.label,
      subtitle: address.context || (isFr ? 'Adresse' : 'Address'),
      address,
    }));

    const matchedActions = actions.filter(action =>
      normalize(action.title).includes(q) || normalize(action.subtitle).includes(q));

    return [
      ...matchedLines,
      ...matchedStops,
      ...matchedTraffic,
      ...matchedAddresses,
      ...matchedActions,
    ];
  }, [query, lines, stops, trafficInfo, addresses, actions, isFr]);

  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setActiveIndex(0);
  }
  const safeIndex = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  const select = useCallback((result: SpotlightResult) => {
    switch (result.kind) {
      case 'stop':    onSelectStop(result.stop); break;
      case 'line':    onSelectLine(result.line); break;
      case 'address': onSelectAddress(result.address); break;
      case 'traffic': onOpenTraffic(); break;
      case 'action':  result.run(); break;
    }
    onClose();
  }, [onSelectStop, onSelectLine, onSelectAddress, onOpenTraffic, onClose]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => (results.length === 0 ? 0 : (index + 1) % results.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => (results.length === 0 ? 0 : (index - 1 + results.length) % results.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const result = results[safeIndex];
      if (result) select(result);
    }
  };

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [safeIndex]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[10002] flex justify-center bg-black/40 px-4"
          style={{ alignItems: 'flex-start', paddingTop: '18vh' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={onClose}
        >
          <motion.div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl backdrop-blur-xl"
            initial={{ opacity: 0, scale: 0.97, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -12 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-slate-700/70 px-4 py-3">
              <MagnifyingGlassIcon className="h-5 w-5 flex-shrink-0 text-slate-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isFr ? 'Rechercher sur GreLines...' : 'Search GreLines...'}
                className="w-full bg-transparent text-[17px] text-white outline-none placeholder:text-slate-500"
                spellCheck={false}
                autoComplete="off"
              />
              <kbd className="hidden flex-shrink-0 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:block">
                esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
              {results.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  {isFr ? 'Aucun résultat' : 'No results'}
                </p>
              ) : (
                results.map((result, index) => (
                  <button
                    key={result.id}
                    data-active={index === safeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(result)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                      index === safeIndex ? 'bg-blue-600/25' : 'hover:bg-slate-800/60'
                    }`}
                  >
                    <ResultIcon result={result} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-white">
                        {result.title}
                      </span>
                      <span className="block truncate text-[12px] text-slate-400">
                        {result.subtitle}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Pastille de gauche : badge officiel pour une ligne, icône sinon. */
function ResultIcon({ result }: { result: SpotlightResult }) {
  if (result.kind === 'line') {
    return (
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
        <LineBadge
          line={{
            id: result.line.id,
            shortName: result.line.shortName,
            color: result.line.color,
            textColor: result.line.textColor,
          }}
          size="xs"
        />
      </span>
    );
  }

  const iconClass = 'h-4 w-4';
  const icon =
    result.kind === 'stop' ? <MapPinIcon className={`${iconClass} text-amber-300`} /> :
    result.kind === 'address' ? <HomeIcon className={`${iconClass} text-sky-300`} /> :
    result.kind === 'traffic' ? <ExclamationTriangleIcon className={`${iconClass} text-orange-300`} /> :
    result.id === 'action-route' ? <ArrowsRightLeftIcon className={`${iconClass} text-slate-300`} /> :
    <Cog6ToothIcon className={`${iconClass} text-slate-300`} />;

  return (
    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800">
      {icon}
    </span>
  );
}
