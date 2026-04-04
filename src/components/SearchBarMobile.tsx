import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/solid';
import type { Stop } from '../types';

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
  calculateItineraryWith: string;
}

export const SearchBarMobile = ({
  searchQuery,
  onSearchChange,
  matchedStops,
  stops,
  searchHistoryItems,
  searchPlaceholder,
  unknownCityLabel,
  onStopClick,
  isFocused,
  onFocus,
  calculateItineraryWith,
}: SearchBarMobileProps) => {
  const getStopByName = (name: string) => {
    return stops.find(stop => stop.name === name);
  };
  return (
    <div className="fixed z-50 top-4 left-4">
      <div
        onMouseEnter={() => onFocus(true)}
        onMouseLeave={() => !searchQuery && onFocus(false)}
        className={`relative h-10 transition-[width] duration-300 ease-out ${
          isFocused ? 'w-[90vw]' : 'w-10'
        } group`}
      >
        <div className="absolute inset-0 bg-slate-900/85 border border-gray-700 shadow-lg rounded-full transition-all duration-300" />

        <div className="relative h-full flex items-center pr-2">
          <div
            className={`absolute z-20 flex items-center justify-center h-full ${
              isFocused
                ? 'left-5 -translate-x-0'
                : 'left-1/2 -translate-x-1/2'
            }`}
          >
            <MagnifyingGlassIcon className="w-5 h-5 text-white" />
          </div>

          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => onFocus(true)}
            onBlur={() => !searchQuery && onFocus(false)}
            placeholder={searchPlaceholder}
            className={`h-full pl-10 pr-4 bg-transparent border-none outline-none text-sm text-gray-100 placeholder-gray-400 transition-all duration-300 ease-out ${
              isFocused || searchQuery.trim() !== ''
                ? 'opacity-100 w-[calc(90vw-48px)]'
                : 'opacity-0 w-0'
            }`}
            autoComplete="off"
          />

          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 text-gray-400 hover:text-gray-200"
              type="button"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {isFocused && (
          <>
            {/* Invisible hover bridge */}
            <div
              className="absolute left-0 top-10 w-[90vw] h-2 pointer-events-auto"
            />
            
            <div className="absolute left-0 top-12 w-[90vw] max-h-72 overflow-auto bg-slate-900/95 border border-gray-700 rounded-2xl shadow-xl">
            {searchQuery.trim() !== '' ? (
              matchedStops.length > 0 ? (
                matchedStops.map((stop) => (
                  <button
                    key={stop.id}
                    onClick={() => {
                      onStopClick(stop);
                      onSearchChange('');
                      onFocus(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-800 transition border-b border-slate-800"
                  >
                    <div className="text-sm font-medium text-gray-200">{stop.name}</div>
                    <div className="text-xs text-gray-400">{stop.city || unknownCityLabel}</div>
                  </button>
                ))
              ) : null
            ) : (
              searchHistoryItems.length > 0 && (
                searchHistoryItems.map((historyItem, index) => {
                  const stop = getStopByName(historyItem);
                  return (
                    <button
                      key={`history-${index}`}
                      onClick={() => {
                        if (stop) {
                          onStopClick(stop);
                          onSearchChange('');
                          onFocus(false);
                        }
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 transition border-b border-slate-800"
                    >
                      <div className="text-sm font-medium text-gray-200">{historyItem}</div>
                      <div className="text-xs text-gray-400">{stop?.city || unknownCityLabel}</div>
                    </button>
                  );
                })
              )
            )}
            
            {/* Séparateur avec logo GreGo */}
            <div className="border-t border-gray-600 px-3 py-3">
              <a href="https://web-tag-express.vercel.app" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer">
                <span>{calculateItineraryWith}</span>
                <img 
                  src="/assets/GreGoLOGO.png" 
                  alt="GreGo" 
                  className="h-4 w-auto"
                />
              </a>
            </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
