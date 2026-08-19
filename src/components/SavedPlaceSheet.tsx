/**
 * Définir son domicile ou son travail.
 *
 * Deux points qu'on saisit une fois pour toutes : ils méritent leur propre
 * écran plutôt qu'un détour par le champ d'arrivée. La feuille s'ouvre en
 * grand — on vient y chercher une adresse, pas jeter un œil — avec une barre
 * de recherche et, pour ce qui ne se dit pas par une adresse, un renvoi vers
 * la carte : on pointe, et le point choisi devient le lieu.
 *
 * Ce qui s'affiche est toujours un nom ; les coordonnées, elles, restent
 * dessous, invisibles, puisque ce sont elles qui calculent les trajets.
 *
 * La feuille est dessinée à la main plutôt qu'empruntée à `react-modal-sheet` :
 * cette bibliothèque ne rend son conteneur visible qu'au terme d'une animation
 * pilotée en JavaScript, et il suffit que celle-ci n'aille pas au bout — une
 * ouverture juste après une fermeture, un écran qui ne compose plus — pour que
 * la feuille reste invisible et ne se rouvre plus jamais. Ici le glissement est
 * une transition CSS : l'état d'arrivée est déclaré, donc atteint.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPinIcon, StopCircleIcon, XMarkIcon, HomeIcon, BriefcaseIcon, MapIcon } from '@heroicons/react/24/solid';
import { searchAddresses } from '../services/geocoding';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { RouteLocation } from '../services/api';
import type { SavedPlaceKind } from '../services/savedPlaces';
import type { Stop } from '../types';

interface SavedPlaceSheetProps {
  /** Lieu à définir. Il reste renseigné feuille fermée, le temps qu'elle descende. */
  kind: SavedPlaceKind;
  isOpen: boolean;
  stops: Stop[];
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  onClose: () => void;
  onSelect: (kind: SavedPlaceKind, location: RouteLocation) => void;
  /** Ouvre la carte en plein écran pour y désigner le lieu. */
  onPickOnMap: (kind: SavedPlaceKind) => void;
}

/**
 * Le contenu de la feuille, monté à la demande.
 *
 * Il est remonté à chaque lieu — la clé du parent s'en charge — si bien que la
 * recherche repart vierge d'un lieu à l'autre, sans effet de remise à zéro.
 */
function SavedPlaceSearch({ kind, stops, language, theme = 'dark', isOpen, onClose, onSelect, onPickOnMap }: SavedPlaceSheetProps) {
  const isFr = language === 'fr';
  const isLight = theme === 'light';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RouteLocation[]>([]);
  const debouncedQuery = useDebouncedValue(query, 250);
  const inputRef = useRef<HTMLInputElement>(null);

  const text = {
    home: isFr ? 'Domicile' : 'Home',
    work: isFr ? 'Travail' : 'Work',
    titleHome: isFr ? 'Définir le domicile' : 'Set home',
    titleWork: isFr ? 'Définir le travail' : 'Set work',
    placeholder: isFr ? 'Adresse ou arrêt' : 'Address or stop',
    openMap: isFr ? 'Ouvrir la carte' : 'Open the map',
    openMapHint: isFr ? 'Pointer un endroit précis' : 'Point at an exact spot',
    stops: isFr ? 'Arrêts' : 'Stops',
    addresses: isFr ? 'Adresses' : 'Addresses',
    noResult: isFr ? 'Aucun résultat' : 'No results',
    close: isFr ? 'Fermer' : 'Close',
  };

  /* Le clavier s'ouvre avec la feuille : on vient y écrire une adresse. */
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 3) return;
    let active = true;
    void searchAddresses(trimmed).then(found => {
      if (!active) return;
      setResults(found.slice(0, 6).map(address => ({
        id: address.id,
        label: address.label,
        lat: address.lat,
        lon: address.lon,
        kind: 'address' as const,
        raw: address,
      })));
    }).catch(() => {
      if (active) setResults([]);
    });
    return () => { active = false; };
  }, [debouncedQuery]);

  /**
   * Une recherche trop courte n'affiche rien — sans qu'il faille vider la
   * liste : ce qui compte est ce qu'on montre, pas ce qu'on garde.
   */
  const addresses = query.trim().length < 3 ? [] : results;

  const stopMatches = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 2) return [];
    return stops
      .filter(stop => stop.name.toLowerCase().includes(trimmed))
      .slice(0, 5)
      .map((stop): RouteLocation => ({
        id: stop.id,
        label: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        kind: 'stop',
        raw: stop,
      }));
  }, [query, stops]);

  const surface = isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900';
  const strong = isLight ? 'text-slate-900' : 'text-white';
  const Icon = kind === 'work' ? BriefcaseIcon : HomeIcon;

  return (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 px-3 pb-3 pt-1">
              <Icon className="h-5 w-5 flex-shrink-0 text-blue-500" />
              <div className={`min-w-0 flex-1 text-base font-bold ${strong}`}>
                {kind === 'work' ? text.titleWork : text.titleHome}
              </div>
              <button
                type="button"
                onClick={onClose}
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                  isLight ? 'text-slate-600 active:bg-slate-200' : 'text-slate-300 active:bg-slate-800'
                }`}
                aria-label={text.close}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="px-3 pb-3">
              <input
                ref={inputRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={text.placeholder}
                enterKeyHint="search"
                className={`h-14 w-full rounded-2xl border px-4 text-base outline-none transition focus:border-blue-500 ${
                  isLight
                    ? 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
                    : 'border-slate-800 bg-slate-900 text-white placeholder:text-slate-500'
                }`}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-8">
              <button
                type="button"
                onClick={() => kind && onPickOnMap(kind)}
                className={`mb-3 flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition active:scale-[0.99] ${surface}`}
              >
                <MapIcon className="h-5 w-5 flex-shrink-0 text-blue-500" />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[0.95rem] font-semibold ${strong}`}>{text.openMap}</span>
                  <span className="block truncate text-xs text-slate-500">{text.openMapHint}</span>
                </span>
              </button>

              {stopMatches.length > 0 && (
                <>
                  <div className="px-1 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {text.stops}
                  </div>
                  <div className={`mb-3 overflow-hidden rounded-2xl border ${surface}`}>
                    {stopMatches.map((location, index) => (
                      <button
                        key={location.id}
                        type="button"
                        onClick={() => kind && onSelect(kind, location)}
                        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-blue-500/10 ${
                          index > 0 ? (isLight ? 'border-t border-slate-200' : 'border-t border-slate-800') : ''
                        }`}
                      >
                        <StopCircleIcon className="h-5 w-5 flex-shrink-0 text-blue-400" />
                        <span className={`min-w-0 flex-1 truncate text-[0.95rem] font-semibold ${strong}`}>
                          {location.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {addresses.length > 0 && (
                <>
                  <div className="px-1 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {text.addresses}
                  </div>
                  <div className={`overflow-hidden rounded-2xl border ${surface}`}>
                    {addresses.map((location, index) => (
                      <button
                        key={location.id}
                        type="button"
                        onClick={() => kind && onSelect(kind, location)}
                        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-blue-500/10 ${
                          index > 0 ? (isLight ? 'border-t border-slate-200' : 'border-t border-slate-800') : ''
                        }`}
                      >
                        <MapPinIcon className="h-5 w-5 flex-shrink-0 text-amber-400" />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[0.95rem] font-semibold ${strong}`}>
                            {location.raw?.name || location.label}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {location.raw?.context || location.label}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {query.trim().length >= 3 && stopMatches.length === 0 && addresses.length === 0 && (
                <p className="px-1 py-6 text-center text-sm text-slate-500">{text.noResult}</p>
              )}
            </div>
          </div>
  );
}

export function SavedPlaceSheet(props: SavedPlaceSheetProps) {
  const { kind, isOpen, theme = 'dark', onClose } = props;
  const isLight = theme === 'light';

  /** Elle se referme aussi en la tirant vers le bas, comme toute feuille. */
  const dragStartRef = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);
  const handleDragStart = (event: React.PointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    dragStartRef.current = event.clientY;
  };
  const handleDragMove = (event: React.PointerEvent) => {
    if (dragStartRef.current == null) return;
    const offset = Math.max(0, event.clientY - dragStartRef.current);
    dragYRef.current = offset;
    setDragY(offset);
  };
  const handleDragEnd = () => {
    if (dragStartRef.current == null) return;
    dragStartRef.current = null;
    if (dragYRef.current > 140) onClose();
    dragYRef.current = 0;
    setDragY(0);
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-[10001] bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`fixed inset-x-0 bottom-0 top-8 z-[10002] flex flex-col overflow-hidden rounded-t-3xl border-t transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        } ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`}
        style={{
          pointerEvents: isOpen ? 'auto' : 'none',
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY > 0 ? 'none' : undefined,
        }}
        aria-hidden={!isOpen}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className="flex justify-center pb-1 pt-3">
          <div className={`h-1.5 w-12 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/20'}`} />
        </div>
        {/* La clé remet la recherche à zéro d'un lieu à l'autre. */}
        <SavedPlaceSearch {...props} key={kind} />
      </div>
    </>
  );
}
