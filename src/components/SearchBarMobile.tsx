import { MagnifyingGlassIcon, XMarkIcon, ClockIcon, MapPinIcon, StopCircleIcon, MicrophoneIcon } from '@heroicons/react/24/solid';
import { useRef } from 'react';
import type { Stop } from '../types';
import type { AddressResult } from '../services/geocoding';

interface SearchBarMobileProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  matchedStops: Stop[];
  stops: Stop[];
  searchHistoryItems: string[];
  searchPlaceholder: string;
  unknownCityLabel: string;
  onStopClick: (stop: Stop) => void;
  isFocused: boolean;
  onFocus: (focused: boolean) => void;
  /** Address results from BAN geocoder. Optional — falls back to stops-only. */
  addressResults?: AddressResult[];
  /** Called when the user picks an address. */
  onAddressClick?: (address: AddressResult) => void;
  language?: 'fr' | 'en';
  /** @deprecated Footer removed — prop kept for API compat, ignored. */
  calculateItineraryWith?: string;
}

export const SearchBarMobile = ({
  searchQuery, onSearchChange, matchedStops, stops, searchHistoryItems,
  searchPlaceholder, unknownCityLabel, onStopClick, isFocused, onFocus,
  addressResults = [], onAddressClick, language = 'fr',
}: SearchBarMobileProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const getStopByName = (name: string) => stops.find(s => s.name === name);

  const hasResults = matchedStops.length > 0 || addressResults.length > 0;
  const showDropdown =
    isFocused &&
    (searchQuery.trim() !== ''
      ? true /* always show, including the "no results" state */
      : searchHistoryItems.length > 0);

  /**
   * Selecting a result:
   *   - blur the input (closes mobile keyboard)
   *   - clear the query
   *   - exit focused mode (hides dropdown)
   *
   * This must run on `onPointerDown` (not `onClick`), otherwise the input's
   * `onBlur` fires first and unmounts the dropdown before the click registers.
   */
  const closeAfterSelection = () => {
    inputRef.current?.blur();
    onSearchChange('');
    onFocus(false);
  };

  const handleSelectStop = (stop: Stop) => {
    closeAfterSelection();
    onStopClick(stop);
  };

  const handleSelectAddress = (address: AddressResult) => {
    closeAfterSelection();
    onAddressClick?.(address);
  };

  const stopsLabel = language === 'fr' ? 'Arrêts' : 'Stops';
  const addressesLabel = language === 'fr' ? 'Adresses' : 'Addresses';
  const noResultsLabel = language === 'fr' ? 'Aucun résultat' : 'No results';
  const clearLabel = language === 'fr' ? 'Effacer la recherche' : 'Clear search';
  const mobilePlaceholder = language === 'fr' ? 'On va où ?' : 'Where to?';

  return (
    <div className="fixed left-4 right-4 top-[max(0.75rem,env(safe-area-inset-top))]" style={{ zIndex: 5 }}>
      <div className="relative transition-all duration-300 ease-out">

        {/* Search input — wider on mobile, fixed at top */}
        <div
          className={`flex items-center gap-3 px-4 border backdrop-blur-xl shadow-2xl transition-all duration-300 rounded-[28px] ${
            isFocused
              ? 'border-emerald-300/50 bg-slate-950/95 shadow-emerald-950/30'
              : 'border-white/10 bg-slate-950/82 shadow-black/30'
          }`}
          style={{ height: '58px' }}
        >
          <MagnifyingGlassIcon className="h-6 w-6 flex-shrink-0 text-white/90" />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={() => onFocus(true)}
            onBlur={() => { if (!searchQuery) onFocus(false); }}
            placeholder={isFocused ? searchPlaceholder : mobilePlaceholder}
            className="min-w-0 flex-1 border-none bg-transparent text-[18px] font-semibold text-white outline-none placeholder-slate-400"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {searchQuery && (
            <button
              onPointerDown={e => {
                e.preventDefault();
                onSearchChange('');
                inputRef.current?.focus();
              }}
              type="button"
              className="w-7 h-7 flex items-center justify-center bg-slate-700 rounded-full flex-shrink-0 active:bg-slate-600"
              aria-label={clearLabel}
            >
              <XMarkIcon className="w-4 h-4 text-slate-300" />
            </button>
          )}
          {!searchQuery && (
            <MicrophoneIcon className="h-6 w-6 flex-shrink-0 text-slate-300" />
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && (
          <div className="absolute left-0 right-0 top-[66px] max-h-[68vh] overflow-y-auto rounded-[28px] border border-white/10 bg-[#15161a]/96 shadow-2xl shadow-black/40 backdrop-blur-xl">

            {searchQuery.trim() !== '' ? (
              <>
                {/* Stops first — higher weight */}
                {matchedStops.length > 0 && (
                  <>
	                    <div className="px-5 pt-4 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      {stopsLabel}
                    </div>
                    {matchedStops.map(stop => (
                      <button
                        key={stop.id}
                        type="button"
                        onPointerDown={e => {
                          e.preventDefault();
                          handleSelectStop(stop);
                        }}
	                        className="flex w-full items-center gap-3 border-b border-white/10 px-5 py-4 text-left transition last:border-0 hover:bg-white/5 active:bg-white/10"
                      >
	                        <StopCircleIcon className="h-6 w-6 flex-shrink-0 text-white" />
                        <div className="min-w-0 flex-1">
	                          <div className="truncate text-[17px] font-extrabold text-white">{stop.name}</div>
	                          <div className="mt-0.5 truncate text-sm text-slate-400">{stop.city || unknownCityLabel}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {/* Addresses below stops */}
                {addressResults.length > 0 && (
                  <>
	                    <div className="border-t border-white/10 px-5 pt-4 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      {addressesLabel}
                    </div>
                    {addressResults.map(addr => (
                      <button
                        key={addr.id}
                        type="button"
                        onPointerDown={e => {
                          e.preventDefault();
                          handleSelectAddress(addr);
                        }}
	                        className="flex w-full items-center gap-3 border-b border-white/10 px-5 py-4 text-left transition last:border-0 hover:bg-white/5 active:bg-white/10"
                      >
	                        <MapPinIcon className="h-6 w-6 flex-shrink-0 text-white" />
                        <div className="min-w-0 flex-1">
	                          <div className="truncate text-[17px] font-extrabold text-white">{addr.name}</div>
	                          <div className="mt-0.5 truncate text-sm text-slate-400">{addr.context}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {!hasResults && (
	                  <div className="px-5 py-7 text-center text-sm text-slate-400">
                    {noResultsLabel}
                  </div>
                )}
              </>
            ) : (
              <>
                {searchHistoryItems.map((item, i) => {
                  const stop = getStopByName(item);
                  return (
                    <button
                      key={`h-${i}`}
                      type="button"
                      onPointerDown={e => {
                        e.preventDefault();
                        if (stop) handleSelectStop(stop);
                      }}
	                      className="w-full border-b border-white/10 px-5 py-4 text-left transition last:border-0 hover:bg-white/5 active:bg-white/10"
                    >
                      <div className="flex items-center gap-2">
	                        <ClockIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
                        <div>
	                          <div className="text-[17px] font-extrabold text-white">{item}</div>
	                          <div className="mt-0.5 text-sm text-slate-400">{stop?.city || unknownCityLabel}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
