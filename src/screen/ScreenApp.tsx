import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { Stop } from '../types';
import { loadScreenStops } from './screenData';
import { buildScreenUrl, parseScreenLayout, parseScreenPlace, parseScreenStopId, type ScreenLayout, type ScreenPlace } from './screenUtils';
import { PRINTED_STOP_IDS, normalizeStopId, resolveStopFromUrlId } from '../services/stopAliases';
import { ScreenSearch } from './ScreenSearch';
import { ScreenBoard } from './ScreenBoard';
import './screen.css';

export function ScreenApp() {
  const [stopId, setStopId] = useState(() => parseScreenStopId(window.location.pathname));

  const [layout, setLayout] = useState<ScreenLayout>(() => parseScreenLayout(window.location.search));
  const [place, setPlace] = useState<ScreenPlace | null>(() => parseScreenPlace(window.location.search));

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove('dark');
    body.classList.remove('dark');
    root.style.colorScheme = 'light';
    body.style.backgroundColor = '#ffffff';
    return () => {
      root.style.colorScheme = '';
      body.style.backgroundColor = '';
    };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setStopId(parseScreenStopId(window.location.pathname));
      setLayout(parseScreenLayout(window.location.search));
      setPlace(parseScreenPlace(window.location.search));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleSelect = useCallback((stop: Stop, chosenLayout: ScreenLayout) => {
    const chosenPlace = { name: stop.name, city: stop.city };
    window.history.pushState(null, '', buildScreenUrl(stop.id, chosenLayout, chosenPlace));
    setStopId(stop.id);
    setLayout(chosenLayout);
    setPlace(chosenPlace);
  }, []);

  // the stop id changed in a newer version: keep the screen on the same stop
  const handleMoved = useCallback((stop: Stop) => {
    window.history.replaceState(null, '', buildScreenUrl(stop.id, layout, place ?? { name: stop.name, city: stop.city }));
    setStopId(stop.id);
  }, [layout, place]);

  useEffect(() => {
    const printedId = normalizeStopId(stopId);
    if (!printedId || !PRINTED_STOP_IDS[printedId]) return;
    let active = true;

    void (async () => {
      const stops = await loadScreenStops();
      if (!active) return;

      const resolved = resolveStopFromUrlId(printedId, stops);
      if (!resolved || resolved.id === stopId) return;
      window.history.replaceState(null, '', buildScreenUrl(resolved.id, layout, place ?? { name: resolved.name, city: resolved.city }));
      setStopId(resolved.id);
    })();

    return () => {
      active = false;
    };
  }, [stopId, layout, place]);

  useEffect(() => {
    document.title = stopId ? `${stopId} \\ GreLines Screen` : 'GreLines Screen';
  }, [stopId]);

  return stopId ? (
    <ScreenBoard key={stopId} stopId={stopId} layout={layout} place={place} onMoved={handleMoved} />
  ) : (
    <ScreenSearch onSelect={handleSelect} />
  );
}
