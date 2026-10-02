import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PlusIcon } from '@heroicons/react/24/solid';
import { OuraWallet } from './OuraWallet';
import { OuraCardFace } from './OuraCardFace';
import { IoWifi } from 'react-icons/io5';
import { useIsOffline, useReconnectCount } from '../hooks/useIsOffline';
import { AddCardSheet } from './AddCardSheet';
import {
  listOuraCards,
  subscribeToCards,
  verifyCards,
  isSupabaseConfigured,
  type OuraCard,
} from '../services/ouraCard';

interface AccountScreenProps {
  isOpen: boolean;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  settings: ReactNode;
  onCardFocusChange?: (focused: boolean) => void;
  onScrolledChange?: (scrolled: boolean) => void;
  onCardsChange?: (cards: OuraCard[]) => void;
}

export function AccountScreen({ isOpen, language, theme = 'dark', settings, onCardFocusChange, onScrolledChange, onCardsChange }: AccountScreenProps) {
  const isFr = language === 'fr';
  const isLight = theme === 'light';
  const [cards, setCards] = useState<OuraCard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  const [isCardFocused, setIsCardFocused] = useState(false);
  const lastScrollRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    return subscribeToCards(() => {
      void listOuraCards().then(setCards);
    });
  }, [isOpen]);

  const offline = useIsOffline();
  const reconnects = useReconnectCount();
  const [loadedAt, setLoadedAt] = useState(0);
  if (loaded && reconnects !== loadedAt) {
    setLoadedAt(reconnects);
    setLoaded(false);
  }

  useEffect(() => {
    if (!isOpen || loaded || offline) return;
    let active = true;
    void listOuraCards().then(async list => {
      if (!active) return;
      setCards(list);
      setLoaded(true);
      const checked = await verifyCards(list);
      if (active) setCards(checked);
    });
    return () => { active = false; };
  }, [isOpen, loaded, offline]);

  return (
    <>
      <div
        className={`fixed inset-0 z-[5] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-white'}`}
        style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
        aria-hidden={!isOpen}
      >
        <div
          className={`min-h-0 flex-1 overscroll-contain px-5 ${
            isCardFocused ? 'overflow-hidden pb-10' : 'overflow-y-auto pb-40'
          }`}
          style={{ paddingTop: 'max(calc(var(--gl-safe-top) + 4px), 1.25rem)' }}
          onScroll={event => {
            const top = event.currentTarget.scrollTop;
            const previous = lastScrollRef.current;
            lastScrollRef.current = top;
            if (top <= 8) onScrolledChange?.(false);
            else if (top > previous + 2) onScrolledChange?.(true);
            else if (top < previous - 2) onScrolledChange?.(false);
          }}
        >
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              isCardFocused ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
            }`}
            aria-hidden={isCardFocused}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="mb-4 flex items-center justify-between gap-3 px-1">
                <h2 className={`text-[1.75rem] font-extrabold leading-none ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {isFr ? 'Compte' : 'Account'}
                </h2>
                {isSupabaseConfigured && !offline && (
                  <button
                    type="button"
                    onClick={() => setIsAddCardOpen(true)}
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border transition active:scale-90 ${
                      isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-800 bg-slate-900 text-slate-200'
                    }`}
                    aria-label={isFr ? 'Ajouter une carte' : 'Add a card'}
                  >
                    <PlusIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {offline ? (
            <div className="relative">
              <OuraCardFace forceFront className="opacity-40" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <IoWifi className="h-12 w-12 text-white drop-shadow" aria-hidden="true" />
                <span className="text-center text-sm font-semibold text-white drop-shadow">
                  {isFr ? 'Pas de connexion' : 'No connection'}
                </span>
                <span className="px-6 text-center text-xs text-white/80 drop-shadow">
                  {isFr ? 'Vos cartes s’afficheront au retour du réseau.' : 'Your cards will show once you are back online.'}
                </span>
              </div>
            </div>
          ) : (
          <OuraWallet
            cards={cards}
            language={language}
            theme={theme}
            disabled={!isSupabaseConfigured}
            onAddCard={() => setIsAddCardOpen(true)}
            onCardsChange={next => {
              setCards(next);
              onCardsChange?.(next);
            }}
            onFocusChange={focused => {
              setIsCardFocused(focused);
              onCardFocusChange?.(focused);
            }}
          />
          )}

          <div
            className={`mt-10 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              isCardFocused ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
            style={{ transform: isCardFocused ? 'translateY(50vh)' : 'translateY(0)' }}
            aria-hidden={isCardFocused}
          >
            {settings}
          </div>
        </div>
      </div>

      <AddCardSheet
        isOpen={isAddCardOpen}
        language={language}
        theme={theme}
        onClose={() => setIsAddCardOpen(false)}
        onSaved={card => {
          setCards(current => {
            const next = [...current.filter(entry => entry.id !== card.id), card];
            onCardsChange?.(next);
            return next;
          });
        }}
      />
    </>
  );
}
