/**
 * L'écran Compte.
 *
 * C'est une page, pas une feuille : elle occupe l'écran du haut au bas, et la
 * barre de navigation s'y pose par-dessus sans rien à tirer. On ne consulte
 * pas ses cartes du coin de l'œil au-dessus d'une carte routière — on y va.
 *
 * Le portefeuille d'abord, les réglages ensuite, à nu : ils ne sont pas un
 * écran de plus à ouvrir mais la seconde moitié de celui-ci.
 */

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
  /** Les réglages, rendus à nu par le panneau des réglages lui-même. */
  settings: ReactNode;
  /** Une carte est passée au premier plan : la barre d'onglets s'en va. */
  onCardFocusChange?: (focused: boolean) => void;
  /** L'écran défile : la barre d'onglets se resserre sur ses icônes. */
  onScrolledChange?: (scrolled: boolean) => void;
  onCardsChange?: (cards: OuraCard[]) => void;
}

export function AccountScreen({ isOpen, language, theme = 'dark', settings, onCardFocusChange, onScrolledChange, onCardsChange }: AccountScreenProps) {
  const isFr = language === 'fr';
  const isLight = theme === 'light';
  const [cards, setCards] = useState<OuraCard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  /** Une carte au premier plan : le reste de l'écran lui cède la place. */
  const [isCardFocused, setIsCardFocused] = useState(false);
  /** Position du dernier défilement, pour en connaître le sens. */
  const lastScrollRef = useRef(0);

  /**
   * L'écran suit les changements d'état des cartes : une coupure ou une remise
   * en service décidée ailleurs arrive ici sans rien recharger.
   */
  useEffect(() => {
    if (!isOpen) return;
    return subscribeToCards(() => {
      void listOuraCards().then(setCards);
    });
  }, [isOpen]);

  /*
   * Les cartes viennent du serveur : sans réseau, il n'y a rien à montrer, et
   * la carte le dit. Au retour de la connexion, on les recharge.
   */
  const offline = useIsOffline();
  const reconnects = useReconnectCount();
  const [loadedAt, setLoadedAt] = useState(0);
  if (loaded && reconnects !== loadedAt) {
    setLoadedAt(reconnects);
    setLoaded(false);
  }

  /** Les cartes ne se chargent qu'à la première venue sur l'écran. */
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
      {/* L'écran arrive par la droite et repart par la droite : on se déplace
          latéralement d'un écran à l'autre, comme si on pouvait les faire
          glisser. Le glissement est en CSS — l'état d'arrivée est déclaré, donc
          atteint, même si l'animation ne joue pas.

          Il passe sous la barre d'onglets (z-10), qui reste exactement la même
          d'un écran à l'autre : c'est elle le point fixe. */}
      <div
        className={`fixed inset-0 z-[5] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-white'}`}
        style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
        aria-hidden={!isOpen}
      >
        {/* Carte au premier plan : l'écran se fige. Il n'y a plus rien à
            faire défiler — les réglages sont partis — et un défilement
            emporterait la carte hors de vue au premier effleurement. */}
        <div
          className={`min-h-0 flex-1 overscroll-contain px-5 ${
            isCardFocused ? 'overflow-hidden pb-10' : 'overflow-y-auto pb-40'
          }`}
          style={{ paddingTop: 'max(env(safe-area-inset-top), 1.25rem)' }}
          onScroll={event => {
            /*
             * Barre resserrée en descendant, redéployée dès qu'on remonte —
             * même d'un rien. Ce n'est pas la hauteur atteinte qui décide mais
             * le sens du geste : on lit vers le bas, on cherche vers le haut.
             */
            const top = event.currentTarget.scrollTop;
            const previous = lastScrollRef.current;
            lastScrollRef.current = top;
            if (top <= 8) onScrolledChange?.(false);
            else if (top > previous + 2) onScrolledChange?.(true);
            else if (top < previous - 2) onScrolledChange?.(false);
          }}
        >
          {/* Le titre et l'ajout partagent la même ligne : ajouter une carte est
              l'action de cet écran, elle se tient à côté de son nom.

              Une carte au premier plan les efface tous les deux, et la ligne se
              referme sur elle-même : la carte remonte d'autant, sans qu'on ait
              eu à la déplacer. */}
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              isCardFocused ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
            }`}
            aria-hidden={isCardFocused}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="mb-4 flex items-center justify-between gap-3 px-1">
                <h2 className={`text-[28px] font-extrabold leading-none ${isLight ? 'text-slate-900' : 'text-white'}`}>
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
            /* La carte grisée, et le pictogramme de la connexion par-dessus :
               même gabarit que la carte vide, pour que l'écran ne saute pas. */
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

          {/* Les réglages s'en vont vers le bas de l'écran quand une carte passe
              devant — ils descendent d'un demi-écran en s'effaçant — et
              remontent quand on la repose. */}
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
