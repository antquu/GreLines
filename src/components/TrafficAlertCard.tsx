/**
 * La perturbation, telle qu'elle se présente partout.
 *
 * L'infotrafic apparaissait à cinq endroits — la fiche d'un arrêt, celle d'une
 * ligne, le détail d'un trajet, les prochains passages — et se présentait
 * différemment à chaque fois : ici un liseré ambre pâle, là un fond plein, là
 * encore un accordéon à la mécanique propre. La même information n'avait pas
 * deux fois le même visage, et l'on devait réapprendre à la lire à chaque
 * écran. Ce composant est désormais le seul endroit où cette carte est
 * dessinée.
 *
 * Le modèle est celui de « Cet arrêt est concerné », dans la fiche d'un arrêt :
 * fond ambre sombre, cadre franc, l'avertissement d'abord, puis ce qui se
 * passe.
 *
 * Pliée par défaut. Une perturbation tient rarement en deux lignes, et trois
 * perturbations dépliées repoussaient les prochains passages hors de l'écran —
 * alors qu'on venait justement pour eux. On voit donc ce qui est touché, et
 * l'on déplie ce qu'on veut lire.
 */

import { useState } from 'react';
import { ChevronDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { stripHtml } from '../utils/stripHtml';
import { useTranslated } from '../hooks/useTranslated';
import { useOnScreen } from '../hooks/useOnScreen';
import { sortLinesByPriority } from '../utils/lineOrder';
import type { Line, TrafficDetail } from '../types';

export interface TrafficAlertCardProps {
  detail: TrafficDetail;
  language: 'fr' | 'en';
  /** Les lignes touchées, affichées en pictogrammes une fois dépliée. */
  lines?: Line[];
  /**
   * Le libellé de l'en-tête, quand il y a mieux à dire que « Perturbation en
   * cours » : le détail d'un trajet nomme la ligne concernée, parce que la
   * carte y est isolée et qu'on ne sait pas sinon de quoi elle parle.
   */
  heading?: string;
  /** Ouverte d'emblée. Réservé au cas où la carte est seule à l'écran. */
  defaultExpanded?: boolean;
  /**
   * La carte se replie.
   *
   * Vrai partout où la perturbation s'ajoute à autre chose — les prochains
   * passages d'un arrêt, le détail d'un trajet — et où trois perturbations
   * dépliées repousseraient hors de l'écran ce qu'on venait chercher.
   *
   * Faux sur l'écran Infotrafic, qui ne montre que des perturbations : là, tout
   * replier oblige à ouvrir une à une des cartes dont la lecture est le seul
   * objet de la page.
   */
  expandable?: boolean;
  /**
   * Thème clair.
   *
   * L'ambre reste l'ambre — c'est la couleur de l'avertissement, elle ne change
   * pas de sens avec le fond —, mais elle s'inverse : encre sombre sur fond
   * pâle. Un rectangle presque noir posé sur une page blanche se lirait comme
   * un trou.
   */
  isLight?: boolean;
}

export function TrafficAlertCard({
  detail,
  language,
  lines,
  heading,
  defaultExpanded = false,
  expandable = true,
  isLight = false,
}: TrafficAlertCardProps) {
  const isFr = language === 'fr';
  const [open, setOpen] = useState(defaultExpanded);
  const expanded = expandable ? open : true;

  /*
   * Le réseau publie ses avis en HTML.
   *
   * « <p>Du mardi 4 août…</p><p>En raison de travaux…</p> » : affiché tel quel,
   * on lit les balises. Elles sont retirées ici, une fois, plutôt que chez
   * chacun des cinq appelants — l'un d'eux finissait toujours par oublier.
   */
  /*
   * Le réseau écrit en français, l'app se lit dans les deux langues.
   *
   * La traduction est demandée par la carte elle-même, c'est-à-dire seulement
   * pour ce qui est à l'écran : le réseau publie des centaines de perturbations,
   * on en lit trois. Tant qu'elle n'est pas revenue, le français reste affiché
   * — une perturbation qu'on ne comprend qu'à moitié vaut mieux qu'un cadre vide.
   */
  const rawTitle = stripHtml(detail.titre ?? '').trim();
  const rawDescription = stripHtml(detail.description ?? '').trim();
  const [cardRef, onScreen] = useOnScreen<HTMLDivElement>();
  /*
   * La visibilité commande, et elle seule.
   *
   * J'avais écrit « vu à l'écran *ou* ouvert », en pensant rattraper un
   * observateur de visibilité qui ne se déclencherait pas. Sur l'écran
   * Infotrafic, où les cartes ne se replient pas, « ouvert » est vrai pour
   * toutes : les trois cent soixante-neuf perturbations ont demandé leur
   * traduction dans la même seconde, et le service a répondu par des refus en
   * série. Une condition de repli qui se déclenche toujours n'est pas un repli.
   */
  const title = useTranslated(rawTitle, language, onScreen) || (isFr ? 'Perturbation' : 'Disruption');
  const description = useTranslated(rawDescription, language, onScreen && expanded);
  const headingLabel = heading ?? (isFr ? 'Perturbation en cours' : 'Ongoing disruption');
  const sortedLines = lines && lines.length > 0 ? [...lines].sort(sortLinesByPriority) : [];
  /* Rien de plus à montrer : la carte garde son cadre, mais pas le chevron qui
     promettrait un dépliage vide. */
  const hasMore = Boolean(description) || Boolean(detail.dateFin) || sortedLines.length > 0;

  return (
    <div
      ref={cardRef}
      className={`overflow-hidden rounded-2xl border ${
        isLight ? 'border-amber-300 bg-amber-50' : 'border-amber-700 bg-amber-950'
      }`}
    >
      <button
        type="button"
        onClick={() => hasMore && expandable && setOpen(value => !value)}
        aria-expanded={hasMore && expandable ? expanded : undefined}
        disabled={!hasMore || !expandable}
        className={`w-full px-3 py-3 text-left transition ${
          hasMore && expandable
            ? isLight
              ? 'hover:bg-amber-100'
              : 'hover:bg-amber-900/30'
            : 'cursor-default'
        }`}
      >
        <div className="mb-1 flex items-center gap-2">
          <ExclamationTriangleIcon
            className={`h-4 w-4 flex-shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}
          />
          <p className={`min-w-0 flex-1 text-xs font-semibold ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
            {headingLabel}
          </p>
          {hasMore && expandable && (
            <ChevronDownIcon
              className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${
                isLight ? 'text-amber-600/70' : 'text-amber-400/70'
              } ${expanded ? 'rotate-180' : ''}`}
            />
          )}
        </div>
        {/* Le titre reste lisible plié : c'est lui qui dit s'il faut ouvrir. */}
        <p className={`text-xs ${isLight ? 'text-amber-900' : 'text-amber-200'}`}>{title}</p>
      </button>

      {/*
        Le contenu apparaît, il ne se déplie pas.

        Une animation de hauteur part de zéro : si elle ne se joue pas — moteur
        d'animation absent, mouvement réduit, appareil poussif — le détail reste
        à zéro et l'on clique sur une carte qui ne s'ouvre jamais. Un simple
        fondu part de l'état naturel : au pire il n'y a pas de fondu, et le
        texte est là.
      */}
      {expanded && hasMore && (
        <div className="gl-fade px-3 pb-3">
          {description && (
            <p
              className={`whitespace-pre-line text-xs leading-relaxed ${
                isLight ? 'text-amber-800/80' : 'text-amber-300/70'
              }`}
            >
              {description}
            </p>
          )}
          {detail.dateFin && (
            <p className={`mt-1 text-xs ${isLight ? 'text-amber-700/70' : 'text-amber-400/60'}`}>
              {isFr ? 'Fin estimée' : 'Estimated end'} {detail.dateFin}
            </p>
          )}
          {sortedLines.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`text-xs ${isLight ? 'text-amber-700/70' : 'text-amber-300/60'}`}>
                {isFr ? 'Lignes' : 'Lines'}
              </span>
              {sortedLines.map(line => (
                <LineBadge
                  key={line.id}
                  line={{
                    id: line.id,
                    shortName: line.shortName || line.id,
                    color: line.color,
                    textColor: line.textColor,
                  }}
                  size="xs"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
