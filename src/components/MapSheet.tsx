/**
 * La feuille posée sur la carte.
 *
 * Décalquée de l'exemple « Apple Maps » de `react-modal-sheet`, et partagée par
 * les deux choses qui vivent au bas de l'écran : l'accueil et la fiche d'un
 * arrêt. Ce n'est pas une économie de code, c'est ce qui permet à l'une de
 * prendre la place de l'autre sans qu'on voie la couture — même largeur, même
 * rayon, mêmes paliers, même fond. Quand la fiche d'arrêt redescend sur son
 * palier bas, elle a exactement la forme de la barre d'onglets qui la remplace.
 *
 * Trois valeurs suivent les paliers et font tout le travail :
 *
 * - une marge latérale, qui décolle la feuille des bords tant qu'elle est basse
 *   et s'annule au dernier palier — c'est l'étirement jusqu'à la bordure de
 *   l'écran ;
 * - un rayon bas, qui arrondit les angles inférieurs de la carte flottante et
 *   disparaît quand elle rejoint le bas de l'écran ;
 * - un `clip-path` qui coupe tout ce qui dépasse sous la carte. Sans lui, la
 *   feuille est une colonne qui descend sous l'écran : c'est cette découpe qui
 *   en fait une pastille posée sur la carte, sans rien enrober — la
 *   bibliothèque exige que l'en-tête et le contenu restent enfants directs du
 *   conteneur.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { interpolate, motion, useMotionTemplate, useTransform } from 'framer-motion';
import { Sheet } from 'react-modal-sheet';
import { NAV_ITEM_WIDTH } from './MobileNavBar';

/**
 * Hauteur visible de la feuille au palier bas : la poignée plus la barre
 * d'onglets, et rien d'autre. En pixels, pour que la barre tienne pile dedans
 * quelle que soit la taille de l'écran — une fraction laisserait du vide sous
 * la barre sur les grands téléphones et la couperait sur les petits.
 */
export const NAVBAR_SNAP_PX = 108;

/**
 * Hauteur de la bande qui porte la poignée, tout en haut de la feuille.
 *
 * Verrouillée, la feuille n'a plus rien à tirer : cette bande disparaît et la
 * pastille se rétrécit d'autant par le haut, jusqu'à ne plus faire que la
 * hauteur de ses onglets.
 */
export const HANDLE_BAND_PX = 18;

/**
 * Ce que la pastille perd quand les libellés se replient.
 *
 * La ligne de texte disparue, la barre n'a plus besoin de sa hauteur : elle se
 * raccourcit d'autant et descend donc vers le bas de l'écran. Elle se resserre
 * aussi en largeur, chaque onglet n'ayant plus qu'une icône à loger.
 */
export const COMPACT_SHRINK_PX = 20;
export const COMPACT_ITEM_WIDTH = 56;

/** Marge qui décolle la feuille des bords de l'écran tant qu'elle est basse. */
export const SHEET_PADDING = 8;

/** Rayon des angles de la feuille. */
export const SHEET_RADIUS = 30;

/** Index du palier le plus haut, où la feuille devient défilable. */
export const LAST_SNAP = 3;

/** Index du palier bas — celui qui a la taille de la barre d'onglets. */
export const NAVBAR_SNAP = 1;

/**
 * Ce que la feuille réserve en bas de l'écran : rien.
 *
 * Elle mesurait `env(safe-area-inset-bottom)` — la barre d'accueil de
 * l'iPhone — pour s'en écarter. Tant que la page était mise en boîte par le
 * système, cette mesure valait zéro et la barre d'onglets se posait au ras du
 * bord. Le jour où la page est passée en pleine hauteur (`viewport-fit=cover`),
 * la mesure est devenue réelle et la barre est remontée d'autant : ce n'était
 * plus la même application.
 *
 * On garde donc le dessin d'avant. La barre d'accueil de l'iPhone est un trait
 * qui flotte par-dessus le contenu, comme au-dessus d'une carte plein écran —
 * elle n'a pas besoin qu'on lui creuse une place, et la pastille est
 * translucide de toute façon.
 *
 * La fonction reste : c'est ici, et à un seul endroit, qu'on rendrait la marge
 * si l'on changeait d'avis.
 */
export function readSafeAreaBottom(): number {
  return 0;
}

/**
 * Marge latérale de la pastille repliée.
 *
 * La feuille ne s'étale pas sur toute la largeur quand elle est seule sur la
 * carte : elle ne fait que la largeur des onglets, centrée. Elle ne dépasse
 * jamais l'écran moins une marge de sécurité.
 *
 * La fiche d'arrêt s'aligne sur la même valeur bien qu'elle n'ait pas
 * d'onglets : c'est cette largeur commune qui rend le relais invisible.
 */
export function collapsedNavPadding(
  viewportWidth: number,
  itemWidth: number,
  itemCount = 4,
): number {
  const natural = itemCount * itemWidth + SHEET_PADDING * 2;
  const width = Math.min(natural, viewportWidth - 32);
  return Math.max(SHEET_PADDING, Math.round((viewportWidth - width) / 2));
}

/**
 * Interpole une valeur sur les paliers de la feuille.
 *
 * Le `y` de la feuille descend quand elle monte : on retourne les deux tableaux
 * pour donner à `interpolate` une plage croissante, et l'on obtient une valeur
 * qui suit le doigt image par image plutôt que de sauter d'un palier à l'autre.
 */
export function useSnapValue<T extends string | number>(output: T[], fallback: T) {
  const { snapPoints, y } = Sheet.useContext();

  return useTransform(y, value => {
    if (snapPoints.length !== output.length) return fallback;
    const mix = interpolate(
      [...snapPoints].reverse().map(point => point.snapValueY),
      [...output].reverse(),
    );
    return mix(value);
  });
}

/**
 * Les paliers de la feuille, en pixels pour le bas et en fractions au-dessus.
 *
 * Le palier bas vaut la hauteur de la barre d'onglets : c'est lui qui donne à
 * la pastille sa forme, et c'est sur lui que les deux feuilles se relaient.
 */
export function mapSheetSnapPoints(options: {
  bottomInset: number;
  /** Feuille sans poignée : la bande du haut disparaît. */
  noHandle?: boolean;
  /** Barre resserrée sur ses icônes : la pastille perd la hauteur des libellés. */
  compact?: boolean;
}): number[] {
  return [
    0,
    NAVBAR_SNAP_PX
      - (options.noHandle ? HANDLE_BAND_PX : 0)
      - (options.compact ? COMPACT_SHRINK_PX : 0)
      + options.bottomInset,
    0.6,
    1,
  ];
}

export function MapSheetShell({
  isLight,
  bottomInset,
  collapsedPadding,
  zIndex = 10,
  children,
}: {
  isLight: boolean;
  bottomInset: number;
  /** Marge latérale au palier bas : elle donne à la pastille la largeur de ses onglets. */
  collapsedPadding: number;
  zIndex?: number;
  children: React.ReactNode;
}) {
  const { y, yProgress } = Sheet.useContext();

  const paddingHorizontal = useSnapValue(
    [collapsedPadding, collapsedPadding, SHEET_PADDING, 0],
    collapsedPadding,
  );
  const paddingBottom = useSnapValue(
    [SHEET_PADDING + bottomInset, SHEET_PADDING + bottomInset, SHEET_PADDING + bottomInset, 0],
    SHEET_PADDING + bottomInset,
  );
  const borderBottomRadius = useSnapValue(
    [SHEET_RADIUS, SHEET_RADIUS, SHEET_RADIUS, 0],
    SHEET_RADIUS,
  );

  const surfaceAlpha = useTransform(yProgress, [0.7, 1], [0.72, 0.98]);
  const backgroundColor = useMotionTemplate`rgba(${isLight ? '255, 255, 255' : '23, 30, 44'}, ${surfaceAlpha})`;

  const borderAlpha = useTransform(yProgress, [0.7, 1], [isLight ? 0.7 : 0.16, 0]);
  const borderColor = useMotionTemplate`rgba(${isLight ? '203, 213, 225' : '148, 163, 184'}, ${borderAlpha})`;

  const clipPath = useMotionTemplate`inset(0px 0px calc(${y}px + ${paddingBottom}px) 0px round ${borderBottomRadius}px)`;

  return (
    <Sheet.Container
      style={{
        ['--gl-sheet-padding' as string]: paddingHorizontal,
        width: 'calc(100% - var(--gl-sheet-padding) * 2px)',
        margin: '0 calc(var(--gl-sheet-padding) * 1px)',
        borderTopLeftRadius: `${SHEET_RADIUS}px`,
        borderTopRightRadius: `${SHEET_RADIUS}px`,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderBottom: 'none',
        boxShadow: 'none',
        backdropFilter: 'saturate(150%) blur(10px)',
        backgroundColor,
        borderColor,
        clipPath,
        zIndex,
      }}
    >
      {children}
    </Sheet.Container>
  );
}

/**
 * Contenu de la feuille, effacé tant qu'elle est réduite à sa barre d'onglets :
 * il n'a pas à transparaître sous la pastille pendant qu'on la tire.
 */
export function MapSheetBody({ children }: { children: React.ReactNode }) {
  const opacity = useSnapValue([0, 0, 1, 1], 1);
  return <motion.div className="flex min-h-0 flex-1 flex-col" style={{ opacity }}>{children}</motion.div>;
}

/**
 * La feuille de carte, prête à l'emploi.
 *
 * Toutes les feuilles du téléphone passent par ici : la fiche d'une ligne,
 * l'infotrafic, l'explorateur, les réglages, une adresse, une station de
 * mobilité partagée. Elles ne se distinguent plus que par leur contenu — même
 * poignée, mêmes paliers, même pastille, même façon de s'en aller.
 *
 * Pas de voile : la carte reste vivante derrière, on la déplace pendant qu'on
 * lit. Et le palier bas n'est pas une position de repos — y descendre referme
 * la feuille et rend la barre d'onglets, qui a exactement la même forme. Une
 * feuille qui s'en va ne tombe donc pas hors de l'écran : elle se change en
 * barre d'onglets.
 */
export function MapSheet({
  isOpen,
  onClose,
  isLight,
  zIndex = 10,
  /** Palier d'ouverture. Le milieu par défaut, comme dans Plans. */
  initialSnap = 2,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  isLight: boolean;
  zIndex?: number;
  initialSnap?: number;
  children: React.ReactNode;
}) {
  const safeBottom = useMemo(readSafeAreaBottom, []);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 375 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const snapPoints = useMemo(() => mapSheetSnapPoints({ bottomInset: safeBottom }), [safeBottom]);
  const collapsedPadding = useMemo(
    () => collapsedNavPadding(viewportWidth, NAV_ITEM_WIDTH),
    [viewportWidth],
  );

  /**
   * La feuille a atteint sa position d'ouverture.
   *
   * La bibliothèque annonce les paliers traversés pendant l'ouverture : sans ce
   * garde-fou, la feuille se refermerait avant d'avoir paru.
   */
  const hasSettledRef = useRef(false);
  useEffect(() => { hasSettledRef.current = false; }, [isOpen]);

  return (
    <Sheet
      style={{ zIndex }}
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={snapPoints}
      initialSnap={initialSnap}
      onSnap={index => {
        if (index > NAVBAR_SNAP) { hasSettledRef.current = true; return; }
        if (hasSettledRef.current) onClose();
      }}
    >
      <MapSheetShell
        isLight={isLight}
        bottomInset={safeBottom}
        collapsedPadding={collapsedPadding}
        zIndex={zIndex}
      >
        <Sheet.Header>
          <div className="flex justify-center pt-2 pb-1">
            <div className={`h-1.5 w-16 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/30'}`} />
          </div>
        </Sheet.Header>
        <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>
          <MapSheetBody>{children}</MapSheetBody>
        </Sheet.Content>
      </MapSheetShell>
    </Sheet>
  );
}
