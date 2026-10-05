import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeftIcon, EllipsisVerticalIcon } from '@heroicons/react/24/solid';
import { tx } from '../i18n';
import { appLanguage } from '../utils/appLanguage';

export interface MinimalScreenAction {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export function MinimalScreen({
  isOpen,
  title,
  isLight,
  actions = [],
  bottomInset = true,
  onBack,
  children,
}: {
  isOpen: boolean;
  title: string;
  isLight: boolean;
  actions?: MinimalScreenAction[];
  bottomInset?: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) setMenuOpen(false);
  }, [isOpen]);

  return (
    <div
      className={`fixed inset-0 z-[900] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-white'}`}
      style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
      aria-hidden={!isOpen}
    >
      <header
        className="flex flex-shrink-0 items-center gap-1 px-4 pb-5"
        style={{ paddingTop: 'max(calc(var(--gl-safe-top) + 4px), 1rem)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className={`-ml-1 flex h-9 w-7 flex-shrink-0 items-center justify-center transition active:scale-90 ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}
          aria-label={title}
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
        <h2
          className="min-w-0 flex-1 font-bold"
          style={{ fontSize: '26px', lineHeight: 1.2, margin: 0, color: 'inherit' }}
        >
          {title}
        </h2>
      </header>

      <div
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${bottomInset ? 'pb-28' : ''}`}
      >
        {children}
      </div>

      {actions.length > 0 && (
        <>
          {menuOpen && (
            <button
              type="button"
              aria-label={tx(appLanguage() === 'fr').common.close}
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 z-10"
            />
          )}

          <div
            className="absolute right-4 z-20 flex flex-col items-end gap-2"
            style={{ bottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
          >
            {menuOpen && (
              <div
                className={`gl-rise overflow-hidden rounded-2xl border shadow-2xl ${
                  isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
                }`}
              >
                {actions.map(action => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      action.onSelect();
                    }}
                    className={`block w-full whitespace-nowrap px-5 py-3.5 text-left text-sm font-semibold transition ${
                      action.destructive
                        ? 'text-red-500'
                        : isLight
                        ? 'text-slate-800 active:bg-slate-100'
                        : 'text-slate-100 active:bg-slate-800'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setMenuOpen(value => !value)}
              aria-expanded={menuOpen}
              className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition active:scale-90 ${
                isLight
                  ? 'border-slate-200 bg-white text-slate-700'
                  : 'border-slate-700 bg-slate-900 text-slate-200'
              }`}
            >
              <EllipsisVerticalIcon className="h-5 w-5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
