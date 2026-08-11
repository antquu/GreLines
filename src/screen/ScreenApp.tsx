import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { Stop } from '../types';
import { buildScreenUrl, parseScreenLayout, parseScreenStopId, type ScreenLayout } from './screenUtils';
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
    document.title = stopId ? `${stopId} · GreLines Screen` : 'GreLines Screen';
  }, [stopId]);

  return stopId ? (
    <ScreenBoard key={stopId} stopId={stopId} layout={layout} />
  ) : (
    <ScreenSearch onSelect={handleSelect} />
  );
}
