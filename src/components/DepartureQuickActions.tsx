/**
 * Ce qu'on peut faire d'un passage, une fois la ligne dépliée.
 *
 * Des carrés à parts égales sur toute la largeur, peints de la couleur de la
 * ligne — le titre en haut, le pictogramme en bas à droite.
 *
 * C'étaient des pastilles grises alignées en bas du dépliant, de la taille
 * d'une étiquette. On ne les voyait pas : elles avaient la couleur du fond, la
 * taille du texte secondaire, et se perdaient sous les chiffres qui occupent
 * tout le reste du bloc. On les voit maintenant, et l'on voit de quelle ligne
 * elles parlent.
 *
 * Deux ou trois, selon l'endroit : la fiche d'un arrêt propose la fiche
 * horaire, le tracé et un itinéraire ; celle d'une ligne, l'arrêt et le favori.
 * Le dessin est le même partout, et c'est le but — un carré de couleur veut
 * dire la même chose d'un écran à l'autre.
 */

import type { ComponentType, SVGProps } from 'react';

export interface QuickAction {
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect?: () => void;
  /**
   * Le carré se peint d'une autre couleur que celle de la ligne.
   *
   * Sert au favori posé : l'ambre dit qu'il est déjà là, ce que le libellé seul
   * demanderait de lire.
   */
  background?: string;
  color?: string;
}

export function DepartureQuickActions({
  style,
  actions,
}: {
  /** Les couleurs de la ligne : fond et encre, telles que `resolveLineStyle` les rend. */
  style: { backgroundColor?: string; color?: string };
  actions: QuickAction[];
}) {
  const background = style.backgroundColor || '#1d4ed8';
  const ink = style.color || '#ffffff';

  return (
    <div
      className="grid gap-2 border-t border-slate-700/70 pt-4"
      style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}
    >
      {actions.map(({ label, Icon, onSelect, background: tone, color: toneInk }) => (
        <button
          key={label}
          type="button"
          onClick={onSelect}
          /* `min-w-0` sur une case de grille : sans lui, un libellé long
             élargit sa colonne et les carrés cessent d'être égaux. */
          className="flex min-h-[74px] min-w-0 flex-col justify-between rounded-xl p-2.5 text-left transition active:scale-[0.97]"
          style={{ backgroundColor: tone ?? background, color: toneInk ?? ink }}
        >
          {/* Le titre peut tenir sur deux lignes — « Fiche horaire » n'entre pas
              sur une seule dans un tiers d'écran de téléphone. */}
          <span className="text-[13px] font-bold leading-tight">{label}</span>
          <Icon className="ml-auto h-5 w-5 flex-shrink-0 opacity-90" />
        </button>
      ))}
    </div>
  );
}
