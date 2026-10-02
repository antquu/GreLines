import { getGtfsStops, GTFS_NETWORKS } from '../services/gtfsNetwork';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { Stop } from '../types';
import { buildScreenUrl, parseScreenLayout, parseScreenStopId, type ScreenLayout } from './screenUtils';
import { getActiveNetworks, getStopsByPrefixes } from '../services/api';
import { getTclStops, TCL_NETWORK } from '../services/tclNetwork';
import { PRINTED_STOP_IDS, normalizeStopId, resolveStopFromUrlId } from '../services/stopAliases';
import { ScreenSearch } from './ScreenSearch';
import { ScreenBoard } from './ScreenBoard';
import './screen.css';

export function ScreenApp() {
  const [stopId, setStopId] = useState(() => parseScreenStopId(window.location.pathname));

  const [layout, setLayout] = useState<ScreenLayout>(() => parseScreenLayout(window.location.search));

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove('dark');
    body.classList.remove('dark');
    root.style.colorScheme = 'light';
    return () => {
      root.style.colorScheme = '';
    };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setStopId(parseScreenStopId(window.location.pathname));
      setLayout(parseScreenLayout(window.location.search));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleSelect = useCallback((stop: Stop, chosenLayout: ScreenLayout) => {

    window.history.pushState(null, '', buildScreenUrl(stop.id, chosenLayout));
    setStopId(stop.id);
    setLayout(chosenLayout);
  }, []);

  useEffect(() => {
    const printedId = normalizeStopId(stopId);
    if (!printedId || !PRINTED_STOP_IDS[printedId]) return;
    let active = true;

    void (async () => {
      const networks = getActiveNetworks();
      const [mtag, tcl, stan] = await Promise.all([
        getStopsByPrefixes(networks).catch(() => [] as Stop[]),
        networks.includes(TCL_NETWORK)
          ? getTclStops().catch(() => [] as Stop[])
          : Promise.resolve([] as Stop[]),
        Promise.all(GTFS_NETWORKS.filter(network => networks.includes(network.code))
          .map(network => getGtfsStops(network.code).catch(() => [] as Stop[])))
          .then(lists => lists.flat()),
      ]);
      if (!active) return;

      const resolved = resolveStopFromUrlId(printedId, [...mtag, ...tcl, ...stan]);
      if (!resolved || resolved.id === stopId) return;
      window.history.replaceState(null, '', buildScreenUrl(resolved.id, layout));
      setStopId(resolved.id);
    })();

    return () => {
      active = false;
    };
  }, [stopId, layout]);

  useEffect(() => {
    document.title = stopId ? `${stopId} \\ GreLines Screen` : 'GreLines Screen';
  }, [stopId]);

  return stopId ? (
    <ScreenBoard key={stopId} stopId={stopId} layout={layout} />
  ) : (
    <ScreenSearch onSelect={handleSelect} />
  );
}
