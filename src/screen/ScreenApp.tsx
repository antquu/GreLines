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

  /**
   * Les adresses d'écran envoyées par courriel, et les codes qui ont changé
   * depuis.
   *
   * Un écran s'installe une fois : son adresse est écrite dans un message, dans
   * un signet, parfois collée au dos du téléviseur. Elle ne se corrige pas. Le
   * soir où le réseau renomme un arrêt, tout ce qui pointait dessus affiche un
   * identifiant inconnu — et personne n'est là pour taper la nouvelle adresse.
   *
   * On accepte donc les identifiants durables de `stopAliases`, et l'on remonte
   * jusqu'à l'arrêt d'aujourd'hui par le nom de la station. La barre d'adresse
   * est réécrite au passage, en `replaceState` : l'écran reste sur le code
   * courant, et un rechargement ne repasse pas par la traduction.
   *
   * La liste des arrêts n'est chargée que dans ce cas-là, jamais autrement : un
   * identifiant qui fonctionne n'a rien à faire résoudre.
   */
  useEffect(() => {
    const printedId = normalizeStopId(stopId);
    if (!printedId || !PRINTED_STOP_IDS[printedId]) return;
    let active = true;

    void (async () => {
      const networks = getActiveNetworks();
      const [mtag, tcl] = await Promise.all([
        getStopsByPrefixes(networks).catch(() => [] as Stop[]),
        networks.includes(TCL_NETWORK)
          ? getTclStops().catch(() => [] as Stop[])
          : Promise.resolve([] as Stop[]),
      ]);
      if (!active) return;

      const resolved = resolveStopFromUrlId(printedId, [...mtag, ...tcl]);
      // Rien de certain : on laisse l'identifiant tel quel, et le tableau
      // affichera qu'il ne le connaît pas. Mieux vaut le dire qu'afficher les
      // horaires d'un autre arrêt.
      if (!resolved || resolved.id === stopId) return;
      window.history.replaceState(null, '', buildScreenUrl(resolved.id, layout));
      setStopId(resolved.id);
    })();

    return () => {
      active = false;
    };
  }, [stopId, layout]);

  useEffect(() => {
    document.title = stopId ? `${stopId} · GreLines Screen` : 'GreLines Screen';
  }, [stopId]);

  return stopId ? (
    <ScreenBoard key={stopId} stopId={stopId} layout={layout} />
  ) : (
    <ScreenSearch onSelect={handleSelect} />
  );
}
