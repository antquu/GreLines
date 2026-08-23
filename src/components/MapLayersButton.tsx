/**
 * Les calques de la carte, sur téléphone.
 *
 * Le bouton posé au-dessus du recentrage ne s'ouvre pas sur un panneau : il
 * s'étire. En le touchant, il devient une bande verticale qui contient les
 * logos des opérateurs superposés à la carte, et rien d'autre — pas de titre,
 * pas de compteur, pas de libellé. Un logo grisé veut dire que ce calque n'est
 * plus affiché, ce qui n'a besoin d'aucune explication.
 *
 * La bande pousse vers le haut parce que le bloc est ancré par le bas : la
 * pastille des calques ne bouge pas d'un pixel, ce sont les logos qui
 * apparaissent au-dessus. Rien ne recouvre la feuille d'accueil, qui occupe le
 * bas de l'écran.
 *
 * Seuls Citiz et Voi y figurent : ce sont les seules couches dont on puisse se
 * passer. Masquer les arrêts reviendrait à masquer l'application.
 */

import { motion, type MotionValue } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Square3Stack3DIcon } from '@heroicons/react/24/solid';
import type { SharedOperator } from '../services/sharedMobility';

interface MapLayersButtonProps {
  language: 'fr' | 'en';
  /** Bande dépliée. L'état vit chez le parent, qui la referme au besoin. */
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Les opérateurs masqués. Ce qui n'y est pas est affiché. */
  hidden: Set<SharedOperator>;
  onToggleLayer: (operator: SharedOperator) => void;
  /** Nombre de points disponibles par opérateur, avant masquage. */
  counts: Record<SharedOperator, number>;
  /* Les mêmes mouvements que le bouton de recentrage, pour qu'ils voyagent
     ensemble quand la feuille monte. */
  bottom: MotionValue<string>;
  opacity: MotionValue<number>;
  scale: MotionValue<number>;
}

/**
 * Chaque logo et la place qu'il occupe dans son fichier.
 *
 * Les fichiers sont ceux de la page d'accueil : des toiles de 1414 × 849 dont
 * le tracé n'occupe qu'une bande, jamais la même. On garde ici la mesure de
 * cette bande — relevée sur le canal alpha — pour caler les deux logos sur la
 * même hauteur d'encre. Sans cela, l'un paraîtrait deux fois plus gros que
 * l'autre.
 *
 * Les fichiers en couleurs, et non leur version monochrome : sur la carte, le
 * turquoise de Citiz et le corail de Voi se reconnaissent d'un coup d'œil, là
 * où deux silhouettes blanches demanderaient d'être lues.
 */
const LOGOS: Record<SharedOperator, { file: string; x0: number; x1: number; y0: number; y1: number }> = {
  citiz: { file: 'citiz', x0: 0.113, x1: 0.883, y0: 0.3, y1: 0.694 },
  voi: { file: 'voi', x0: 0.141, x1: 0.855, y0: 0.253, y1: 0.741 },
};

/** Largeur de la bande, et donc du bouton fermé. */
const WIDTH = 48;
/** Largeur allouée à un logo, hauteur de sa case. */
const LOGO_WIDTH = 32;
const SLOT_HEIGHT = 42;

const OPERATORS: SharedOperator[] = ['citiz', 'voi'];

/** Un logo cadré sur son tracé, pour que les deux fassent la même taille. */
function OperatorLogo({ operator }: { operator: SharedOperator }) {
  const box = LOGOS[operator];
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  // La toile fait 1414 × 849 : la zone utile, remise à ses proportions, vaut
  // `largeur / hauteur × 1,665`.
  const drawn = LOGO_WIDTH / ((width / height) * (1414 / 849));

  return (
    <span
      className="relative block overflow-hidden"
      style={{ width: LOGO_WIDTH, height: drawn }}
    >
      <img
        src={`/assets/homepage/svg/${box.file}.svg`}
        alt=""
        className="absolute max-w-none"
        style={{
          width: `${100 / width}%`,
          left: `${(-box.x0 / width) * 100}%`,
          top: `${(-box.y0 / height) * 100}%`,
        }}
      />
    </span>
  );
}

export function MapLayersButton({
  language,
  isOpen,
  onToggle,
  onClose,
  hidden,
  onToggleLayer,
  counts,
  bottom,
  opacity,
  scale,
}: MapLayersButtonProps) {
  const isFr = language === 'fr';
  const rootRef = useRef<HTMLDivElement | null>(null);

  /* Toucher ailleurs referme : une bande dépliée ne doit pas rester ouverte
     dans le dos de quelqu'un qui a repris sa navigation. */
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen, onClose]);

  /*
   * Les deux opérateurs, toujours, dès lors que la bande s'affiche.
   *
   * On pourrait n'y mettre que ceux qui ont des véhicules à l'instant présent,
   * mais un opérateur dont l'API ne répond pas disparaîtrait alors de la
   * bande, et l'on croirait à un bug. Un calque existe indépendamment de ce
   * qu'il contient à cette seconde : il reste donc là, prêt à être éteint pour
   * quand les véhicules reviendront.
   *
   * La bande entière, en revanche, ne paraît pas tant que rien n'a été chargé
   * ni masqué : un réglage qui ne porte sur rien vaut moins que pas de réglage.
   */
  const hasAnything = OPERATORS.some(operator => counts[operator] > 0) || hidden.size > 0;
  if (!hasAnything) return null;
  const available = OPERATORS;

  return (
    <motion.div
      ref={rootRef}
      /* Le même plan que le bouton de recentrage, et pour la même raison :
         l'écran du compte se pose à ce niveau-là. Un cran au-dessus, la bande
         resterait visible par-dessus les réglages, flottant sur une page à
         laquelle elle n'appartient pas. */
      style={{ zIndex: 5, bottom, opacity, scale, width: WIDTH }}
      initial={false}
      className="fixed right-4"
    >
      {/*
        La bande elle-même. Sa hauteur s'anime, et comme le bloc est ancré par
        le bas, elle ne peut grandir que vers le haut. L'arrondi se resserre en
        s'ouvrant : un cercle qui s'étire donnerait une gélule, une bande aux
        angles adoucis se lit comme un objet à part entière.
      */}
      <motion.div
        animate={{
          height: isOpen ? SLOT_HEIGHT * available.length + WIDTH : WIDTH,
          borderRadius: isOpen ? 24 : 999,
        }}
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        initial={false}
        /*
         * `justify-end` : le contenu se tasse vers le bas.
         *
         * C'est ce qui fait que la bande fermée montre la pastille, et non le
         * premier logo. Empilée par le haut, une bande de 48 px laisserait
         * dépasser Citiz et cacherait le bouton — ce qu'on voit dépendrait
         * alors de l'aboutissement de l'animation, ce qui n'est jamais une
         * bonne idée. Ici, fermée, c'est un bouton ; ouverte, c'est une bande.
         */
        className="flex w-full flex-col items-center justify-end overflow-hidden border-2 border-gray-700 bg-slate-900/85 shadow-lg backdrop-blur"
      >
        {available.map(operator => {
          const isVisible = !hidden.has(operator);
          return (
            <button
              key={operator}
              type="button"
              onClick={() => onToggleLayer(operator)}
              aria-pressed={isVisible}
              aria-label={`${operator === 'citiz' ? 'Citiz' : 'Voi'} — ${
                isVisible ? (isFr ? 'affiché' : 'shown') : isFr ? 'masqué' : 'hidden'
              }`}
              /* `tabIndex` retiré quand la bande est fermée : les logos y sont
                 hors du cadre, et l'on ne tabule pas vers ce qu'on ne voit
                 pas. */
              tabIndex={isOpen ? 0 : -1}
              className="flex w-full flex-shrink-0 items-center justify-center transition active:bg-slate-800"
              style={{ height: SLOT_HEIGHT }}
            >
              {/* Grisé, et à demi effacé : la couleur seule ne suffirait pas à
                  quelqu'un qui la distingue mal. */}
              <span
                className="transition-all duration-200"
                style={{
                  filter: isVisible ? 'none' : 'grayscale(1)',
                  opacity: isVisible ? 1 : 0.35,
                }}
              >
                <OperatorLogo operator={operator} />
              </span>
            </button>
          );
        })}

        {/* La pastille, en bas, à la place exacte qu'occupait le bouton fermé. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-label={isFr ? 'Calques de la carte' : 'Map layers'}
          className="relative flex flex-shrink-0 items-center justify-center transition active:bg-slate-800"
          style={{ width: WIDTH - 4, height: WIDTH - 4 }}
        >
          <Square3Stack3DIcon className="h-5 w-5 text-white" />
          {/* Un point dit qu'un calque est masqué : sans lui, on peut chercher
              longtemps pourquoi les trottinettes ont disparu. */}
          {hidden.size > 0 && !isOpen && (
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-blue-500" />
          )}
        </button>
      </motion.div>
    </motion.div>
  );
}
