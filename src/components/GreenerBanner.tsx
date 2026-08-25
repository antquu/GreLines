/**
 * Le remerciement, en haut des messages de la carte.
 *
 * Le portefeuille ne dit que des choses administratives : un numéro, une date
 * de fin de contrat, un incident. Ce bandeau est la seule ligne qui ne demande
 * rien et ne signale rien — elle constate que la personne qui regarde sa carte
 * a pris le tram plutôt que sa voiture, et le lui dit une fois.
 *
 * Il se ferme, et il reste fermé : on remercie quelqu'un une fois. Le refermer
 * s'écrit sur l'appareil, pas sur le compte — c'est un bandeau, pas un
 * réglage, et il n'y a rien à retrouver en changeant de téléphone.
 *
 * Les formes du bas sont muettes et le disent : `aria-hidden`. Ce sont des
 * blocs blancs sans signification, posés là pour que le bandeau ait un bas.
 */

import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';

/** Le vert du bandeau. */
const GREEN = '#489a4e';

const DISMISSED_KEY = 'greLines_greenerBannerClosed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function GreenerBanner({ language }: { language: 'fr' | 'en' }) {
  const [closed, setClosed] = useState(wasDismissed);
  if (closed) return null;

  const dismiss = () => {
    setClosed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-3xl"
      style={{ backgroundColor: GREEN }}
    >
      {/* La croix, en haut à droite : pastille blanche, croix verte — l'inverse
          du bandeau, pour qu'elle se voie sur le vert sans y percer un trou. */}
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm transition active:scale-90"
        aria-label={language === 'fr' ? 'Fermer' : 'Close'}
      >
        <XMarkIcon className="h-5 w-5" style={{ color: GREEN }} />
      </button>

      <p className="px-5 pr-14 pt-4 text-[1.2rem] font-bold leading-snug text-white">
        {language === 'fr'
          ? 'Merci de choisir un moyen plus responsable pour voyager.'
          : 'Thank you for choosing a greener way to travel.'}
      </p>

      {/*
        Les formes, sous le texte.

        Elles débordent volontairement du cadre — un cercle coupé à droite, une
        barre coupée en bas : le bandeau donne à voir un morceau de quelque
        chose de plus grand, au lieu d'une frise qui s'arrête proprement à ses
        bords.
      */}
      <svg
        viewBox="0 0 320 56"
        className="mt-3 block w-full"
        aria-hidden
      >
        <g fill="#ffffff">
          {/* Un quart de disque, ouvert vers le haut à gauche. */}
          <path d="M4 56a30 30 0 0 0 30-30H19a15 15 0 0 1-15 15z" />
          <rect x="20" y="4" width="18" height="18" />
          <circle cx="60" cy="44" r="10" />
          <rect x="88" y="2" width="13" height="46" transform="rotate(22 94 25)" />
          <rect x="140" y="16" width="16" height="16" />
          <rect x="162" y="36" width="12" height="30" />
          {/* Le quart de disque de droite, ouvert vers le bas. */}
          <path d="M190 40a26 26 0 0 1 26-26v14a12 12 0 0 0-12 12z" />
          <rect x="240" y="34" width="18" height="18" transform="rotate(45 249 43)" />
          <circle cx="316" cy="20" r="11" />
        </g>
      </svg>
    </div>
  );
}
