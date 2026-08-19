/**
 * La page minimaliste d'un favori.
 *
 * C'est le coquillage commun de l'arrêt favori et du trajet favori : un
 * chevron et un titre en haut, du contenu qui défile, et rien d'autre — pas de
 * barre d'onglets, pas de carte, pas d'action en évidence. On y vient pour lire
 * deux chiffres, on en repart aussitôt.
 *
 * Les actions ne sont pas absentes, elles sont rangées : un bouton à trois
 * points, posé en bas à droite, à portée du pouce et hors du chemin du regard.
 * Retirer un favori ou le renommer n'arrive qu'une fois — ce n'est pas ce qui
 * mérite la place du contenu.
 *
 * Elle entre par la droite, comme tout ce qui s'enfonce d'un cran dans les
 * favoris.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeftIcon, EllipsisVerticalIcon } from '@heroicons/react/24/solid';

export interface MinimalScreenAction {
  label: string;
  onSelect: () => void;
  /** Retrait, suppression : l'action se teinte de rouge. */
  destructive?: boolean;
}

export function MinimalScreen({
  isOpen,
  title,
  isLight,
  actions = [],
  onBack,
  children,
}: {
  isOpen: boolean;
  title: string;
  isLight: boolean;
  actions?: MinimalScreenAction[];
  onBack: () => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Quitter la page referme son menu : le retrouver ouvert à la prochaine
  // venue serait une surprise, et un menu ouvert masque le contenu.
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
      {/* Le chevron est collé au titre, pas relégué dans un coin : les deux
          forment une seule phrase, « retour depuis Sassenage » — et centrés l'un
          sur l'autre, pour que cette phrase tienne sur une ligne. */}
      <header
        className="flex flex-shrink-0 items-center gap-1 px-4 pb-5"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}
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
        <h2 className="min-w-0 flex-1 text-[26px] font-bold leading-tight">{title}</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28">{children}</div>

      {actions.length > 0 && (
        <>
          {/* Le voile ne noircit rien : il n'est là que pour recevoir le doigt
              qui referme le menu, n'importe où sur la page. */}
          {menuOpen && (
            <button
              type="button"
              aria-label="Fermer"
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
