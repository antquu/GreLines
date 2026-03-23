import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/solid';
import type { Stop } from '../types';

interface SearchBarMobileProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  matchedStops: Stop[];
  onStopClick: (stop: Stop) => void;
  isFocused: boolean;
  onFocus: (focused: boolean) => void;
}

export const SearchBarMobile = ({
  searchQuery,
  onSearchChange,
  matchedStops,
  onStopClick,
  isFocused,
  onFocus,
}: SearchBarMobileProps) => {
  return (
    <div className="fixed z-50 top-4 left-4">
      <div
        onMouseEnter={() => onFocus(true)}
        onMouseLeave={() => !searchQuery && onFocus(false)}
        className={`relative h-10 transition-[width] duration-300 ease-out ${
          isFocused ? 'w-[90vw]' : 'w-10'
        } group`}
      >
        <div className="absolute inset-0 bg-white/85 dark:bg-slate-900/85 border border-gray-300 dark:border-gray-700 shadow-lg rounded-full transition-all duration-300" />

        <div className="relative h-full flex items-center pr-2">
          <div
            className={`absolute z-20 flex items-center justify-center h-full ${
              isFocused
                ? 'left-5 -translate-x-0'
                : 'left-1/2 -translate-x-1/2'
            }`}
          >
            <MagnifyingGlassIcon className="w-5 h-5 text-black dark:text-white" />
          </div>

          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => onFocus(true)}
            onBlur={() => !searchQuery && onFocus(false)}
            placeholder="Search for a stop..."
            className={`h-full pl-10 pr-4 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 transition-all duration-300 ease-out ${
              isFocused || searchQuery.trim() !== ''
                ? 'opacity-100 w-[calc(90vw-48px)]'
                : 'opacity-0 w-0'
            }`}
            autoComplete="off"
          />

          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              type="button"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {isFocused && searchQuery.trim() !== '' && matchedStops.length > 0 && (
          <div className="absolute left-0 top-12 mt-1 w-[90vw] max-h-72 overflow-auto bg-white/95 dark:bg-slate-900/95 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl">
            {matchedStops.map((stop) => (
              <button
                key={stop.id}
                onClick={() => {
                  onStopClick(stop);
                  onSearchChange('');
                  onFocus(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
              >
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{stop.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{stop.city || 'Unknown city'}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
