/**
 * Barre de navigation du téléphone.
 *
 * Elle vit dans l'en-tête de la feuille d'accueil : repliée, c'est la seule
 * chose visible au-dessus de la carte — une pastille posée sur le bas de
 * l'écran, large comme ses onglets et pas plus ; tirée vers le haut, elle
 * s'efface au profit de la barre de recherche pendant que la feuille s'étire.
 *
 * Le dessin est celui de la barre de GreGo, aux couleurs de GreLines : icône
 * de 28 px dans une zone de 40, libellé de 10 px dessous, onglet actif en bleu
 * et légèrement agrandi.
 */

import type { ComponentType, SVGProps } from 'react';

export interface MobileNavItem {
  key: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect: () => void;
  /** Écran pas encore écrit : l'onglet se voit mais ne répond pas. */
  disabled?: boolean;
}

/** Largeur d'un onglet, qui donne sa largeur à la pastille repliée. */
export const NAV_ITEM_WIDTH = 72;

export function MobileNavBar({
  items,
  activeKey,
  isLight = false,
  compact = false,
}: {
  items: MobileNavItem[];
  activeKey?: string;
  isLight?: boolean;
  /**
   * Barre resserrée : les libellés se replient et les icônes grandissent. C'est
   * l'état qu'elle prend dès qu'on fait défiler un écran — le contenu qu'on lit
   * mérite alors la place que prenaient les mots.
   */
  compact?: boolean;
}) {
  return (
    <nav
      aria-label="Navigation principale"
      className={`flex items-stretch px-2 transition-[gap,padding] duration-300 ease-in-out ${
        compact ? 'gap-0 py-0' : 'gap-1 py-1'
      }`}
    >
      {items.map(item => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            onClick={item.disabled ? undefined : item.onSelect}
            aria-current={active ? 'page' : undefined}
            aria-disabled={item.disabled || undefined}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0 rounded-2xl py-1 text-[10px] font-medium transition-colors duration-[800ms] ease-[cubic-bezier(0.45,0,0.55,1)] ${
              item.disabled
                ? 'opacity-40'
                : active
                ? 'text-blue-500'
                : isLight
                ? 'text-slate-500'
                : 'text-slate-400'
            }`}
          >
            <span
              className={`relative z-10 flex items-center justify-center transition-[transform,opacity,width,height] duration-[700ms] ease-[cubic-bezier(0.45,0,0.55,1)] ${
                compact ? 'size-12' : 'size-10'
              } ${active ? 'scale-110 opacity-100' : 'scale-90 opacity-70'}`}
            >
              <item.Icon className="size-7" strokeWidth={1.9} />
            </span>
            <span
              className={`grid overflow-hidden leading-4 transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                compact ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
              }`}
            >
              <span className="min-h-0 truncate px-0.5">{item.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
