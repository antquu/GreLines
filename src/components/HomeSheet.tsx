import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveLineStyle } from '../utils/lineColors';
// `react-modal-sheet` déclare `motion` en pair, mais `motion/react` n'est qu'un
// réexport de `framer-motion` — la même instance, donc les mêmes `MotionValue`.
// On importe depuis `framer-motion`, seul paquet que ce projet déclare.
import { motion, useMotionTemplate, AnimatePresence } from 'framer-motion';
import { Sheet, type SheetRef } from 'react-modal-sheet';
import {
  MapSheetShell,
  MapSheetBody,
  mapSheetSnapPoints,
  collapsedNavPadding,
  readSafeAreaBottom,
  useSnapValue,
  COMPACT_ITEM_WIDTH,
  LAST_SNAP,
} from './MapSheet';
import {
  MapPinIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  ClockIcon,
  ArrowsRightLeftIcon,
  StarIcon,
  UserCircleIcon,
} from '@heroicons/react/24/solid';
import { MobileNavBar, NAV_ITEM_WIDTH, type MobileNavItem } from './MobileNavBar';
import { loadRecentStops, type RecentStop } from '../utils/recentStops';

/**
 * Les visages du nuage de profil.
 *
 * Anonymes, et ils doivent le rester : personne n'a demandé à figurer sur l'écran
 * d'accueil d'un inconnu. Ce sont des émojis tirés au sort, qui représentent un
 * nombre sans désigner quiconque — le nombre exact est écrit juste en dessous.
 *
 * Ce sont les mêmes que ceux qu'on peut se choisir comme avatar : une liste à part
 * ne donnait que des têtes, et le nuage ne ressemblait alors pas aux profils de
 * l'application.
 */
const HOME_FACES = AVATARS;

/** Durée d'un tour, partagée avec la contre-rotation des visages. */
const HOME_SPIN_MS = 110000;

/**
 * Écart minimal entre deux visages, de centre à centre.
 *
 * Le diamètre d'un visage plus cinq pixels : deux émojis tirés au hasard
 * tombaient parfois presque au même endroit, se chevauchaient, et donnaient une
 * tache au lieu de deux personnes. Cinq pixels suffisent à les séparer sans
 * imposer une grille — le nuage doit rester irrégulier.
 */
const HOME_FACE_SIZE = 32;
const HOME_MIN_GAP = HOME_FACE_SIZE + 5;

/**
 * Convertit une place de l'anneau en coordonnées, pour mesurer les écarts.
 *
 * Deux visages proches en angle mais éloignés en rayon ne se touchent pas : on ne
 * peut donc pas comparer les angles, il faut passer par le plan.
 */
function homeFacePoint(angle: number, radius: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}

/**
 * Cherche une place assez à l'écart des autres.
 *
 * Vingt essais, puis on garde le meilleur trouvé : une couronne pleine rendrait
 * la recherche sans issue, et un nuage un peu serré vaut mieux qu'une image qui
 * se figera.
 */
function homeSpacedSlot(
  taken: Array<{ angle: number; radius: number }>
): { angle: number; radius: number } {
  let best = { angle: 0, radius: 0 };
  let bestDistance = -1;

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = { angle: Math.random() * 360, radius: 58 + Math.random() * 22 };
    const point = homeFacePoint(candidate.angle, candidate.radius);
    let nearest = Infinity;
    for (const other of taken) {
      const otherPoint = homeFacePoint(other.angle, other.radius);
      nearest = Math.min(nearest, Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y));
    }
    if (nearest >= HOME_MIN_GAP) return candidate;
    if (nearest > bestDistance) {
      bestDistance = nearest;
      best = candidate;
    }
  }
  return best;
}

interface HomeFace {
  key: number;
  emoji: string;
  angle: number;
  radius: number;
  /** Où en était l'anneau à son apparition, pour démarrer droit. */
  spunBy: number;
}
import { AVATARS, type Account } from '../services/account';
import type { Stop, Line } from '../types';
import { findClosestStops } from '../utils/geo';
import { getStopLines } from '../services/api';
import type { Favorite } from '../services/favorites';
import type { FavoriteDetail } from '../hooks/useFavoriteDetails';
import { AtmoPanel } from './AtmoPanel';
import type { AtmoReport, Commune } from '../services/atmo';

/** Le strict nécessaire pour dessiner une pastille de ligne. */
type MarqueeLine = Pick<Line, 'id' | 'shortName' | 'color' | 'textColor'>;
/** Hauteur de la case que se partagent la barre d'onglets et la recherche. */
const HEADER_SWAP_HEIGHT = 76;

/**
 * Barre d'onglets et barre de recherche, superposées et croisées en fondu.
 *
 * Repliée, la feuille montre ses onglets ; dès qu'on la tire, ils s'effacent au
 * profit de la recherche, qui prend toute la largeur gagnée. Les deux occupent
 * la même case, si bien que rien ne saute : c'est un seul objet qui change de
 * visage. Chacun cesse d'écouter les gestes dès qu'il n'est plus le visage
 * affiché.
 */
function SheetHeaderSwap({
  navBar,
  searchBar,
}: {
  navBar: React.ReactNode;
  searchBar?: React.ReactNode;
}) {
  const navOpacity = useSnapValue([1, 1, 0, 0], 1);
  const searchOpacity = useSnapValue([0, 0, 1, 1], 0);
  const { currentSnap } = Sheet.useContext();
  const searchTakesOver = (currentSnap ?? 1) > 1;

  if (!searchBar) return <>{navBar}</>;

  return (
    // La case se hisse au-dessus du contenu : la liste de résultats de la
    // recherche déborde de l'en-tête, et le corps de la feuille — qui porte une
    // opacité animée, donc son propre contexte d'empilement — passerait sinon
    // par-dessus elle.
    <div className="relative z-30" style={{ height: HEADER_SWAP_HEIGHT }}>
      <motion.div
        className="absolute inset-x-0 top-0"
        style={{ opacity: navOpacity, pointerEvents: searchTakesOver ? 'none' : 'auto' }}
      >
        {navBar}
      </motion.div>
      <motion.div
        className="absolute inset-x-0 top-0 z-30 flex h-full items-center px-4"
        style={{ opacity: searchOpacity, pointerEvents: searchTakesOver ? 'auto' : 'none' }}
      >
        {searchBar}
      </motion.div>
    </div>
  );
}

/**
 * Fond assombri.
 *
 * Il n'apparaît qu'à partir du deuxième palier et s'assombrit à mesure que la
 * feuille monte : repliée sur la carte, la barre d'onglets ne doit rien voiler
 * ni intercepter le moindre geste.
 */
function SheetBackdrop({ onTap, snapIdx }: { onTap: () => void; snapIdx: number }) {
  const opacity = useSnapValue([0, 0, 0, 0.5], 0);
  const backgroundColor = useMotionTemplate`rgba(2, 6, 23, ${opacity})`;

  return (
    <Sheet.Backdrop
      // Le voile n'écoute la tape qu'à partir du deuxième palier. C'est aussi ce
      // qui le rend traversant : la bibliothèque n'active `pointer-events` que
      // sur un voile cliquable, et impose cette règle après nos styles. Repliée
      // sur la carte, la feuille laisse donc passer tous les gestes.
      {...(snapIdx > 1 ? { onTap } : {})}
      style={{
        backgroundColor,
        // L'opacité par défaut suit l'ouverture de la feuille ; ici c'est la
        // couleur qui porte le fondu, sur les seuls paliers hauts.
        opacity: 1,
        zIndex: 9,
      }}
    />
  );
}

interface HomeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  stops: Stop[];
  currentLocation: { lat: number; lon: number } | null;
  onStopClick: (stop: Stop, lineFilter?: string[]) => void;
  onOpenTraffic: () => void;
  onOpenSettings: () => void;
  /** Ouvre l'écran Compte, qui glisse sous la barre d'onglets. */
  onOpenAccount: () => void;
  /** Ouvre l'écran Favoris, page pleine comme le Compte. */
  onOpenFavorites: () => void;
  /**
   * Verrouille la feuille sur sa barre d'onglets : c'est l'état qu'elle prend
   * quand un écran occupe la page en dessous. La barre reste la même — c'est
   * elle qu'on garde — mais elle ne se tire plus.
   */
  locked?: boolean;
  /**
   * La recherche est ouverte : la liste de résultats a le geste vertical.
   *
   * Cette liste est posée dans l'en-tête de la feuille, c'est-à-dire dans la
   * poignée par laquelle on la tire. Sans cette exception, tout glissement dans
   * les résultats faisait descendre la feuille au lieu de faire défiler la
   * liste — on ne pouvait donc pas atteindre le quatrième arrêt trouvé.
   *
   * On rend la poignée le temps de la recherche : fermer la liste rend la
   * feuille à son geste, et l'on n'a rien perdu en route.
   */
  searchOpen?: boolean;
  /** Quitte l'écran Compte : tout autre onglet le referme. */
  onLeaveAccount?: () => void;
  /** Quitte l'écran Favoris : tout autre onglet le referme. */
  onLeaveFavorites?: () => void;
  /** Resserre la barre d'onglets : l'écran du dessous est en train de défiler. */
  navCompact?: boolean;
  onOpenItinerary: () => void;
  /** Ouvre l'explorateur de lignes (recherche mobile focalisée). */
  onOpenLines?: () => void;
  /** Catalogue complet des lignes du réseau, pour le bandeau défilant. */
  allLines?: MarqueeLine[];
  onSnapChange?: (snapIdx: number) => void;
  onSheetProgress?: (progress: number) => void;
  





  snapToMiniSignal?: number;
  
  openToMidSignal?: number;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  /**
   * Le compte, et de quoi montrer son visage.
   *
   * La feuille ne connaît ni la base ni les cartes : elle reçoit ce qu'il faut
   * pour dessiner, et un rappel pour ouvrir le profil.
   */
  account?: Account | null;
  accountPhotoUrl?: string | null;
  /**
   * Combien de cartes contient le portefeuille.
   *
   * La vignette en empile autant, décalées : voir trois cartes plutôt qu'une dit
   * combien on en a sans avoir à ouvrir l'écran, et c'est la question qu'on se
   * pose en cherchant celle du mois.
   */
  walletCardCount?: number;
  onOpenProfile?: () => void;
  favorites: Favorite[];
  favoriteDetails: FavoriteDetail[];
  
  atmoReport: AtmoReport | null;
  atmoLoading: boolean;
  onAtmoCommuneChange: (commune: Commune) => void;
  /** L'indice suit la carte : le panneau n'affiche pas sa recherche. */
  atmoFollowMap?: boolean;
  /**
   * Barre de recherche du parent, affichée à la place des onglets dès que la
   * feuille quitte son palier bas.
   */
  searchBar?: React.ReactNode;
}

const getText = (language: 'fr' | 'en') => ({
  nearbyTitle: language === 'fr' ? 'Arrêts à proximité' : 'Nearby stops',
  noLocation: language === 'fr' ? 'Position non disponible' : 'Location unavailable',
  noLocationHint:
    language === 'fr'
      ? 'Active la localisation pour voir les arrêts autour de toi.'
      : 'Enable location to see stops around you.',
  favoritesTitle: language === 'fr' ? 'Favoris' : 'Favorites',
  noFavorites: language === 'fr'
    ? 'Aucun favori pour le moment. Ajoute-en un en ouvrant un arrêt et en cliquant sur l’étoile.'
    : 'No favorites yet. Add one by opening a stop and tapping the star.',
  loading: language === 'fr' ? 'Chargement…' : 'Loading…',
  noDepartures: language === 'fr' ? 'Aucun passage prévu' : 'No upcoming departures',
  quickAccess: language === 'fr' ? 'Accès rapide' : 'Quick access',
  navHome: language === 'fr' ? 'Autour' : 'Nearby',
  navRoute: language === 'fr' ? 'Itinéraire' : 'Route',
  navFavorites: language === 'fr' ? 'Favoris' : 'Favorites',
  navAccount: language === 'fr' ? 'Compte' : 'Account',
  placesTitle: language === 'fr' ? 'Lieux' : 'Places',
  recentTitle: language === 'fr' ? 'Récents' : 'Recents',
  homeLabel: language === 'fr' ? 'Domicile' : 'Home',
  workLabel: language === 'fr' ? 'Bureau' : 'Work',
  addLabel: language === 'fr' ? 'Ajouter' : 'Add',
  nearbyLabel: language === 'fr' ? 'Autour de moi' : 'Nearby',
  trafficLabel: language === 'fr' ? 'Infotrafic' : 'Traffic info',
  itineraryLabel: language === 'fr' ? 'Itinéraire' : 'Itinerary',
  settingsLabel: language === 'fr' ? 'Réglages' : 'Settings',
  walletLabel: language === 'fr' ? 'GreLines Wallet' : 'GreLines Wallet',
  linesLabel: language === 'fr' ? 'Explorer les lignes' : 'Explore lines',
  remove: language === 'fr' ? 'Retirer' : 'Remove',
  direction: language === 'fr' ? 'Direction' : 'To',
});






function isRoundLine(label: string): boolean {
  const n = label.toUpperCase().trim();
  if (n === 'A' || n === 'B' || n === 'C' || n === 'D' || n === 'E') return true;
  return /^C\d+$/.test(n);
}



function sortLinesForBadge<T extends MarqueeLine>(lines: T[]): T[] {
  const priority = (l: T) => {
    const n = (l.shortName || l.id).toUpperCase();
    if (['A', 'B', 'C', 'D', 'E'].includes(n)) return 0;
    if (/^C\d+$/.test(n)) return 1;
    return 2;
  };
  return [...lines].sort((a, b) => {
    const dp = priority(a) - priority(b);
    if (dp !== 0) return dp;
    return (a.shortName || a.id).localeCompare(b.shortName || b.id, undefined, { numeric: true });
  });
}

function MiniLineBadge({ line }: { line: MarqueeLine }) {
  const label = line.shortName || line.id;
  const round = isRoundLine(label);
  const style = resolveLineStyle(line.id, line.color, line.textColor);
  return (
    <div
      className={`h-6 min-w-[24px] px-1.5 flex items-center justify-center text-[10px] font-extrabold flex-shrink-0 ${
        round ? 'rounded-full' : 'rounded-md'
      }`}
      style={style}
    >
      {label}
    </div>
  );
}

/** Réseaux urbains de l'agglomération, seuls porteurs des codes du bandeau. */
const URBAN_NETWORKS = ['SEM', 'SE2', 'GSV', 'TPV'];

/**
 * Codes Proximo du réseau, dans l'ordre de la grille officielle. La liste est
 * explicite plutôt que déduite d'une couleur : les Proximo ne sont pas tous
 * bleus, et la couleur réelle de chaque ligne vient toujours du catalogue.
 */
const PROXIMO_CODES = [
  '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25',
  '30', '31', '32', '33', '34', '35', '36', '37',
  '80', '82', '84', '85', '86', '88', '89', '90', '91', '92',
  'N62', 'N93', 'N94', 'N97', 'N98', 'N99',
];

function networkOf(id: string): string {
  return id.split(':')[0].toUpperCase().trim();
}

function codeOf(line: MarqueeLine): string {
  return (line.shortName || line.id).toUpperCase().trim();
}

/** Sélection affichée dans le bandeau : trams, Chrono C1→C11, Proximo. */
function isMarqueeLine(line: MarqueeLine): boolean {
  if (!URBAN_NETWORKS.includes(networkOf(line.id))) return false;
  const code = codeOf(line);
  if (['A', 'B', 'C', 'D', 'E'].includes(code)) return true;
  if (/^C([1-9]|1[01])$/.test(code)) return true;
  return PROXIMO_CODES.includes(code);
}

/**
 * Un même code peut exister sur plusieurs réseaux (30 chez TPV et GSV…) : on
 * ne garde qu'une pastille par code, celle du réseau le plus proche du cœur
 * de l'agglomération.
 */
function dedupeByCode(lines: MarqueeLine[]): MarqueeLine[] {
  const best = new Map<string, MarqueeLine>();
  for (const line of lines) {
    const code = codeOf(line);
    const current = best.get(code);
    if (!current || URBAN_NETWORKS.indexOf(networkOf(line.id)) < URBAN_NETWORKS.indexOf(networkOf(current.id))) {
      best.set(code, line);
    }
  }
  return [...best.values()];
}

/**
 * Bandeau d'icônes de lignes qui défile en continu de droite à gauche, sur le
 * même principe que le marquee des infos trafic de la sidebar desktop : la
 * liste est dupliquée et translatée de -50 %, ce qui donne une boucle sans
 * couture. La vitesse est constante en px/s quelle que soit la largeur.
 */
const LINES_MARQUEE_SPEED_PX_PER_SEC = 40;

function LinesMarquee({ lines }: { lines: MarqueeLine[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [durationSec, setDurationSec] = useState(20);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      // La piste contient deux copies : une boucle = la moitié de sa largeur.
      const loopWidth = track.scrollWidth / 2;
      if (loopWidth > 0) {
        setDurationSec(Math.max(8, loopWidth / LINES_MARQUEE_SPEED_PX_PER_SEC));
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => observer.disconnect();
  }, [lines]);

  return (
    <div className="relative w-full overflow-hidden">
      <div
        ref={trackRef}
        className="flex w-max items-center gap-1.5"
        style={{
          animationName: 'footer-marquee',
          animationDuration: `${durationSec}s`,
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
        }}
      >
        {lines.map(line => (
          <MiniLineBadge key={`a-${line.id}`} line={line} />
        ))}
        {lines.map(line => (
          <MiniLineBadge key={`b-${line.id}`} line={line} />
        ))}
      </div>
    </div>
  );
}




/* Note: QuickCircle component is defined but not currently used
const QuickCircle = ({
  Icon,
  label,
  subtitle,
  onClick,
  className,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  subtitle?: string;
  onClick: () => void;
  className: string;
}) => (
  <button
    onClick={onClick}
    className="min-w-[72px] flex-1 text-center transition active:scale-95"
  >
    <div className={`mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-full ${className}`}>
      <Icon className="h-8 w-8 text-white" />
    </div>
    <div className="mt-2 truncate text-sm font-semibold text-white">{label}</div>
    {subtitle && <div className="truncate text-xs font-semibold text-slate-500">{subtitle}</div>}
  </button>
);
*/

export const HomeSheet = ({
  isOpen,
  onClose,
  stops,
  currentLocation,
  onStopClick,
  onOpenTraffic,
  onOpenAccount,
  onOpenFavorites,
  locked = false,
  searchOpen = false,
  onLeaveAccount,
  onLeaveFavorites,
  navCompact = false,
  onOpenItinerary,
  onSnapChange,
  onSheetProgress,
  snapToMiniSignal,
  openToMidSignal,
  language,
  theme = 'dark',
  account,
  accountPhotoUrl,
  walletCardCount = 0,
  onOpenProfile,
  atmoReport,
  atmoLoading,
  onAtmoCommuneChange,
  atmoFollowMap = false,
  onOpenLines,
  allLines = [],
  searchBar,
}: HomeSheetProps) => {
  const text = getText(language);
  /*
   * Quatre arrêts récents, pas huit.
   *
   * La feuille d'accueil porte déjà la recherche, les favoris et le profil :
   * une huitième ligne d'historique repoussait tout le reste sous le pli, et
   * l'on ne descend pas dans un historique, on y reconnaît son arrêt du premier
   * coup d'oeil ou l'on repasse par la recherche. Le stockage en garde huit,
   * lui, parce qu'ils ne coûtent rien et servent au classement.
   */
  const RECENTS_SHOWN = 4;

  const isLight = theme === 'light';

  /*
   * Les arrêts récemment ouverts, relus à chaque venue de la feuille.
   *
   * Relus et non écoutés : la liste ne change que lorsqu'on ouvre un arrêt, ce
   * qui referme la feuille de toute façon. Un abonnement n'aurait rien apporté
   * qu'une mécanique de plus.
   */
  const [recents, setRecents] = useState<RecentStop[]>([]);
  useEffect(() => {
    if (isOpen) setRecents(loadRecentStops().slice(0, RECENTS_SHOWN));
  }, [isOpen]);

  /*
   * Le nuage du profil : cinq visages qui flottent, et se renouvellent.
   *
   * Cinq, comme sur l'écran de fin : ils disent qu'il y a du monde, et le nombre
   * exact est écrit juste en dessous, là où il ne peut pas être pris pour une
   * illustration.
   *
   * Un anneau figé aurait été un décor. Chacun paraît, reste quelques secondes,
   * s'en va, et un autre prend une place différente — on remplace un seul visage
   * à la fois, sinon le nuage entier clignoterait au même rythme.
   */
  const [homeCloud, setHomeCloud] = useState<HomeFace[]>([]);
  const homeSeedRef = useRef(0);

  useEffect(() => {
    if (!isOpen || !account) {
      setHomeCloud([]);
      return;
    }
    const startedAt = Date.now();
    const draw = (taken: Array<{ angle: number; radius: number }>): HomeFace => {
      const slot = homeSpacedSlot(taken);
      return {
        key: homeSeedRef.current++,
        emoji: HOME_FACES[Math.floor(Math.random() * HOME_FACES.length)],
        angle: slot.angle,
        radius: slot.radius,
        spunBy: (((Date.now() - startedAt) % HOME_SPIN_MS) / HOME_SPIN_MS) * 360,
      };
    };

    // Le remplissage initial se fait de proche en proche : chaque visage voit
    // ceux déjà posés, sinon rien ne les empêcherait de tomber au même endroit.
    const initial: HomeFace[] = [];
    for (let i = 0; i < 5; i++) initial.push(draw(initial));
    setHomeCloud(initial);

    const timer = window.setInterval(() => {
      setHomeCloud((current) => {
        if (current.length === 0) return current;
        const next = [...current];
        const index = Math.floor(Math.random() * next.length);
        // Le nouveau visage évite tous les autres, celui qu'il remplace excepté :
        // sa place se libère à l'instant même.
        next[index] = draw(current.filter((_, i) => i !== index));
        return next;
      });
    }, 3000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, account?.cardCode]);
  const surfaceClass = isLight
    ? 'bg-white border border-slate-200 shadow-[0_20px_50px_rgba(148,163,184,0.18)]'
    : 'bg-[#2c2d31]/90 border-white/10 shadow-xl';
  const titleClass = isLight ? 'text-slate-900' : 'text-white';
  const mutedClass = isLight ? 'text-slate-500' : 'text-slate-400';

  // Bandeau défilant : uniquement les trams A→E, les Chrono C1→C11 et les
  // Proximo bleus. Les codes C1…C11 existent aussi côté TER (SNC:C1, bleu
  // marine) : on ne garde que ceux du réseau urbain (SEM / SE2) pour éviter
  // d'afficher la pastille TER à la place de la ligne Chrono.
  const marqueeLines = useMemo(
    () => sortLinesForBadge(dedupeByCode(allLines.filter(isMarqueeLine))),
    [allLines]
  );

  const nearby = useMemo(() => {
    if (!currentLocation) return [];
    return findClosestStops(stops, currentLocation.lat, currentLocation.lon, 5);
  }, [stops, currentLocation?.lat, currentLocation?.lon]);


  /**
   * Pre-fetch the lines serving each nearby stop so the cards can show line
   * badges. We fire 5 parallel requests when the sheet opens (your api.ts
   * already caches them, so subsequent opens are instant). We don't block
   * the rendering — badges fade in as their fetch resolves.
   */
  const [nearbyLines, setNearbyLines] = useState<Record<string, Line[]>>({});
  useEffect(() => {
    if (!isOpen || nearby.length === 0) return;
    let cancelled = false;
    nearby.forEach(({ stop }) => {
      // Skip stops we've already loaded for this session.
      if (nearbyLines[stop.id]) return;
      getStopLines(stop.id)
        .then(lines => {
          if (cancelled) return;
          setNearbyLines(prev => ({ ...prev, [stop.id]: lines }));
        })
        .catch(() => { /* silent — card just shows no badges */ });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, nearby.map(n => n.stop.id).join('|')]);

  const sheetRef = useRef<SheetRef>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [snapIdx, setSnapIdx] = useState<number>(1);
  const safeBottom = useMemo(readSafeAreaBottom, []);
  /**
   * Section affichée. « Autour » est la feuille elle-même ; les autres ouvrent
   * un écran plein, où la poignée de la feuille n'a plus lieu d'être.
   */
  const [activeTab, setActiveTab] = useState('home');


  /**
   * Largeur de l'écran, suivie pour recalculer la pastille : elle doit rester
   * centrée et à la largeur de ses onglets quelle que soit l'orientation.
   */
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 375 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Hold the latest `onSheetProgress` in a ref so the ProgressWatcher's RAF
  // loop never sees a stale closure AND we don't have to put the callback in
  // any effect's deps array (it changes on every parent render, which would
  // otherwise re-run effects and snap the sheet back to its initial state).
  const onSheetProgressRef = useRef(onSheetProgress);
  useEffect(() => { onSheetProgressRef.current = onSheetProgress; }, [onSheetProgress]);

  const handleSnapChange = (idx: number) => {
    setSnapIdx(idx);
    onSnapChange?.(idx);
    // Quitter le palier haut ramène la liste en tête : redescendre sur une page
    // à moitié défilée laisserait voir un morceau de contenu sans son titre.
    if (idx !== LAST_SNAP && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  const collapseToMini = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    sheetRef.current?.snapTo(1);
  };

  /**
   * Onglets de la barre de navigation.
   *
   * « Autour de moi » ne mène nulle part : il déplie la feuille, qui *est*
   * l'accueil — et la replie si elle l'est déjà. Les autres ouvrent leur écran.
   */
  const navItems: MobileNavItem[] = useMemo(() => [
    {
      key: 'home',
      label: text.navHome,
      Icon: MapPinIcon,
      onSelect: () => {
        setActiveTab('home');
        onLeaveAccount?.();
        onLeaveFavorites?.();
        if (snapIdx > 1) collapseToMini();
        else sheetRef.current?.snapTo(2);
      },
    },
    {
      key: 'route',
      label: text.navRoute,
      Icon: ArrowsRightLeftIcon,
      onSelect: () => {
        setActiveTab('route');
        onLeaveAccount?.();
        onLeaveFavorites?.();
        onOpenItinerary();
      },
    },
    {
      key: 'favorites',
      label: text.navFavorites,
      Icon: StarIcon,
      // Les favoris sont une page eux aussi : arrêts et trajets s'y consultent
      // pour eux-mêmes, pas du coin de l'œil au-dessus de la carte.
      onSelect: () => {
        setActiveTab('favorites');
        onOpenFavorites();
      },
    },
    {
      key: 'account',
      label: text.navAccount,
      Icon: UserCircleIcon,
      // Le compte est une page, pas une section de la feuille : on la quitte
      // pour lui, comme pour l'itinéraire.
      onSelect: () => {
        setActiveTab('account');
        onLeaveFavorites?.();
        onOpenAccount();
      },
    },
  ], [text, onOpenItinerary, onOpenAccount, onOpenFavorites, onLeaveAccount, onLeaveFavorites, snapIdx]);

  /**
   * Marge latérale de la pastille repliée.
   *
   * La barre ne s'étale pas sur toute la largeur quand elle est seule sur la
   * carte : elle ne fait que la largeur de ses onglets, centrée. Deux onglets
   * donnent une pastille deux fois plus étroite que quatre. Elle ne dépasse
   * jamais l'écran moins une marge de sécurité.
   */
  const collapsedPadding = useMemo(
    () =>
      collapsedNavPadding(
        viewportWidth,
        navCompact ? COMPACT_ITEM_WIDTH : NAV_ITEM_WIDTH,
        navItems.length,
      ),
    [navItems.length, viewportWidth, navCompact],
  );

  useEffect(() => {
    if (isOpen) {
      onSnapChange?.(1);
      onSheetProgressRef.current?.(0.15);
      const t = setTimeout(() => sheetRef.current?.snapTo(1), 50);
      return () => clearTimeout(t);
    }
    onSnapChange?.(0);
    onSheetProgressRef.current?.(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /**
   * Parent-triggered "reset to mini": when `snapToMiniSignal` changes (the
   * parent bumps it whenever a foreground sheet opens), collapse back to the
   * mini snap and reset the scroll position. The first render is skipped so
   * we don't reset on mount.
   */
  /**
   * Verrouillée, la feuille redescend sur sa barre et y reste.
   *
   * Elle s'y recale aussi quand la barre se resserre : le palier bas a changé
   * de hauteur, et sans ce rappel la pastille gardait son ancien fond — une
   * bande vide sous les icônes, par où l'on voyait la barre de recherche.
   */
  useEffect(() => {
    if (!locked) return;
    const timer = window.setTimeout(() => sheetRef.current?.snapTo(1), 30);
    return () => window.clearTimeout(timer);
  }, [locked, navCompact]);

  /**
   * La feuille qui revient revient sur « Autour ».
   *
   * Elle ne s'efface que pour laisser la place à autre chose — le
   * planificateur, la fiche d'un arrêt. Ce qu'on retrouve en la refermant,
   * c'est la carte et ses arrêts : c'est de là qu'on était parti, et l'onglet
   * doit le dire.
   */
  useEffect(() => {
    if (!isOpen) return;
    // Une carte Oura se referme sur l'écran Compte : la barre garde cet onglet.
    setActiveTab(locked ? 'account' : 'home');
  }, [isOpen, locked]);

  useEffect(() => {
    if (snapToMiniSignal === undefined) return;
    if (!isOpen) return;
    setActiveTab('home');
    collapseToMini();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapToMiniSignal]);

  // Snap to mid (0.6) when the geoloc button is tapped — shows nearby stops.
  useEffect(() => {
    if (openToMidSignal === undefined || openToMidSignal === 0) return;
    if (!isOpen) return;
    // snapPoints = [0, 0.15, 0.6, 1] → index 2 = 0.6
    sheetRef.current?.snapTo(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openToMidSignal]);

  return (
    <Sheet
      ref={sheetRef}
      style={{ zIndex: 10 }}
      isOpen={isOpen}
      onClose={onClose}
      // Le premier palier vaut la hauteur de la barre d'onglets, en pixels : la
      // pastille doit tenir dedans exactement, sans marge vide au-dessous.
      snapPoints={mapSheetSnapPoints({ bottomInset: safeBottom, noHandle: locked, compact: navCompact })}
      initialSnap={1}
      disableDrag={locked || searchOpen}
      disableDismiss
      onSnap={handleSnapChange}
      // Live drag progress. The lib calls this on every animation frame
      // with the *vertical translation* of the sheet in pixels (0 = full,
      // viewportHeight = closed). We normalize it to a [0..1] "openness"
      // fraction where 1 = full and 0 = closed, and forward it to the
      // parent so it can animate elements that should follow the sheet.
      onOpenStart={() => {/* no-op, lib hook */}}
    >
	    <MapSheetShell isLight={isLight} bottomInset={safeBottom} collapsedPadding={collapsedPadding}>
	        <Sheet.Header style={{ position: 'relative', zIndex: 30 }}>
	          {/* La poignée n'a de sens que là où il y a une feuille à tirer :
	              elle s'efface sur les pages qui occupent tout l'écran. */}
	          <div
	            className={`flex justify-center overflow-hidden transition-all duration-300 ${
	              locked ? 'h-0 pt-0 pb-0' : 'pt-2 pb-1'
	            }`}
	          >
	            <div
	              className={`h-1.5 w-16 rounded-full transition-opacity duration-200 ${
	                isLight ? 'bg-slate-300' : 'bg-white/30'
	              } ${activeTab === 'home' ? 'opacity-100' : 'opacity-0'}`}
	            />
	          </div>
	          {/* Barre d'onglets et barre de recherche occupent le même espace et
	              se croisent en fondu : repliée, la feuille montre ses onglets ;
	              dès qu'on la tire, ils cèdent la place à la recherche. */}
	          <SheetHeaderSwap
	            navBar={<MobileNavBar items={navItems} activeKey={activeTab} isLight={isLight} compact={navCompact} />}
	            /* Verrouillée, la feuille ne s'ouvre pas : sa recherche n'a
	               aucune chance d'être atteinte, et transparaissait derrière la
	               barre d'onglets. */
	            searchBar={locked ? undefined : searchBar}
	          />
	          <div
	            className={`mx-5 border-t transition-opacity duration-300 ${
	              isLight ? 'border-slate-200' : 'border-white/10'
	            } ${snapIdx > 1 ? 'opacity-100' : 'opacity-0'}`}
	          />
	        </Sheet.Header>
        <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>
          {/* Live progress watcher — we mount a tiny invisible component that
              re-renders on every motion-value tick and pushes the current
              sheet openness back up to the parent. This is the cleanest way
              to subscribe to per-frame drag updates without forking the lib. */}
          <ProgressWatcher onSheetProgressRef={onSheetProgressRef} />
	        <MapSheetBody>
	          {/* Le contenu ne défile qu'au palier haut : plus bas, le geste
	              vertical appartient à la feuille, pas à la liste. */}
	          <div
	            ref={scrollRef}
	            className={`flex-1 pb-12 ${snapIdx === LAST_SNAP ? 'overflow-y-auto' : 'overflow-hidden'}`}
	          >
	            <div className="px-5 pt-3 space-y-7">
              {/* Les arrêts consultés récemment.
                  La section montrait les arrêts *proches*, ce qui est déjà l'objet
                  de la carte au-dessus. Or ce qu'on rouvre le plus n'est pas le
                  plus près : c'est celui d'hier, celui du travail, celui qu'on a
                  regardé trois fois ce matin. */}
              <section>
                <div className="mb-3 flex items-center gap-2 px-1">
                  <h3
                    className={`text-sm font-semibold leading-none ${titleClass}`}
                    style={isLight ? { color: '#0f172a' } : undefined}
                  >
                    {text.recentTitle}
                  </h3>
                </div>
                {recents.length === 0 ? (
                  <div className={`rounded-[28px] p-6 text-center ${surfaceClass}`}>
                    <p className={`text-sm ${mutedClass}`}>
                      {language === 'fr'
                        ? 'Les arrêts que vous ouvrez apparaîtront ici.'
                        : 'Stops you open will show up here.'}
                    </p>
                  </div>
                ) : (
                  <div className={`overflow-hidden rounded-[28px] ${surfaceClass}`}>
                    {recents.map((entry, idx) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() =>
                          onStopClick({
                            id: entry.id,
                            name: entry.name,
                            city: entry.city,
                            lat: entry.lat,
                            lon: entry.lon,
                          } as Stop)
                        }
                        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-black/5 ${
                          idx > 0 ? (isLight ? 'border-t border-slate-200' : 'border-t border-white/5') : ''
                        }`}
                      >
                        <ClockIcon className={`h-5 w-5 flex-shrink-0 ${mutedClass}`} />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-[15px] font-semibold ${titleClass}`}
                            style={isLight ? { color: '#0f172a' } : undefined}
                          >
                            {entry.name}
                          </span>
                          {entry.city && (
                            <span className={`block truncate text-xs ${mutedClass}`}>{entry.city}</span>
                          )}
                        </span>
                        <ChevronRightIcon className={`h-4 w-4 flex-shrink-0 ${mutedClass}`} />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Le profil, sous les récents.
                  Le même nuage que l'écran de fin de trajet : c'est le même
                  propos — voici les gens que vos relevés ont renseignés — et le
                  revoir en ouvrant l'application rappelle à quoi sert de laisser le
                  guidage tourner. */}
              {account && onOpenProfile && (
                <section>
                  <button
                    type="button"
                    onClick={onOpenProfile}
                    className={`w-full overflow-hidden rounded-[28px] p-5 text-left transition active:scale-[0.99] ${surfaceClass}`}
                  >
                    <div className="relative mx-auto flex h-40 w-40 items-center justify-center">
                      <motion.div
                        className="absolute inset-0 z-10"
                        animate={{ rotate: 360 }}
                        transition={{ duration: HOME_SPIN_MS / 1000, repeat: Infinity, ease: 'linear' }}
                      >
                        <AnimatePresence>
                          {homeCloud.map((face) => (
                            <motion.span
                              key={face.key}
                              className="absolute flex h-8 w-8 items-center justify-center rounded-full bg-white text-base shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
                              style={{
                                left: `calc(50% + ${
                                  Math.cos((face.angle * Math.PI) / 180) * face.radius
                                }px - 1rem)`,
                                top: `calc(50% + ${
                                  Math.sin((face.angle * Math.PI) / 180) * face.radius
                                }px - 1rem)`,
                              }}
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ duration: 1.1, ease: 'easeInOut' }}
                              aria-hidden
                            >
                              {/* Le visage tient droit pendant que l'anneau tourne :
                                  il défait exactement la rotation du parent, en
                                  partant de là où l'anneau était quand il est
                                  apparu. Sans ça, un émoji finit la tête en bas au
                                  bout d'un demi-tour. */}
                              <motion.span
                                className="block"
                                animate={{ rotate: [-face.spunBy, -face.spunBy - 360] }}
                                transition={{
                                  duration: HOME_SPIN_MS / 1000,
                                  repeat: Infinity,
                                  ease: 'linear',
                                }}
                              >
                                {face.emoji}
                              </motion.span>
                            </motion.span>
                          ))}
                        </AnimatePresence>
                      </motion.div>

                      <span className="relative z-0 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white text-[42px] shadow-[0_6px_20px_rgba(0,0,0,0.3)]">
                        {/* La photographie déposée d'abord, l'émoji ensuite,
                            la photo de la carte en dernier : du plus choisi au
                            plus subi. */}
                        {account.avatarUrl ? (
                          <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : account.avatarEmoji ? (
                          <span aria-hidden>{account.avatarEmoji}</span>
                        ) : accountPhotoUrl ? (
                          <img src={accountPhotoUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span aria-hidden>{'\u{1F642}'}</span>
                        )}
                      </span>
                    </div>

                    {/* Le nom d'état civil au-dessus du pseudonyme : c'est celui
                        de la carte, il dit à qui appartient le compte, tandis
                        que le pseudonyme dit sous quel nom on se montre. Le plus
                        petit des deux passe devant, comme une mention. */}
                    {[account.firstName, account.lastName].some(Boolean) && (
                      <p className={`mt-4 text-sm font-medium leading-none ${mutedClass}`}>
                        {[account.firstName, account.lastName].filter(Boolean).join(' ')}
                      </p>
                    )}

                    <p
                      className={`text-[20px] font-extrabold leading-none ${
                        [account.firstName, account.lastName].some(Boolean) ? 'mt-1.5' : 'mt-4'
                      } ${titleClass}`}
                      style={isLight ? { color: '#0f172a' } : undefined}
                    >
                      {account.pseudo}
                    </p>

                    <div
                      className={`mt-3 rounded-2xl px-4 py-3.5 ${
                        isLight ? 'bg-slate-100' : 'bg-white/5'
                      }`}
                    >
                      <p
                        className={`tabular text-[28px] font-extrabold leading-none ${titleClass}`}
                        style={isLight ? { color: '#0f172a' } : undefined}
                      >
                        {account.travellersHelped.toLocaleString('fr-FR')}
                      </p>
                      <p className={`mt-1 text-sm ${mutedClass}`}>
                        {language === 'fr'
                          ? 'personnes que vous avez aidées'
                          : 'travellers you have helped'}
                      </p>
                    </div>
                  </button>
                </section>
              )}


	              <section>
	                <h3 className={`mb-3 px-1 text-xs font-semibold uppercase tracking-wider ${mutedClass}`}>
	                  {text.quickAccess}
	                </h3>
	                <div className="grid grid-cols-2 gap-3">
	                  <button
	                    onClick={onOpenTraffic}
	                    className={`rounded-[24px] p-4 text-left transition active:scale-[0.98] ${
	                      isLight
	                        ? 'border border-slate-200 bg-white shadow-[0_12px_30px_rgba(148,163,184,0.14)]'
	                        : 'border border-white/10 bg-white/5'
	                    }`}
	                  >
	                    <ExclamationTriangleIcon className="mb-3 h-7 w-7 text-amber-300" />
	                    <span className={`text-sm font-bold ${titleClass}`} style={isLight ? { color: '#0f172a' } : undefined}>{text.trafficLabel}</span>
	                  </button>
	                  {/* Réglages a quitté cette grille : il vit dans l'écran Compte,
	                      où l'on va déjà pour sa carte.

	                      Favoris et le portefeuille y reviennent, en revanche. Ce
	                      sont les deux écrans qu'on ouvre en arrivant — reprendre un
	                      arrêt qu'on suit, montrer sa carte au valideur — et les
	                      atteindre depuis la feuille évite de traverser la barre
	                      d'onglets pour deux gestes quotidiens. */}
	                  <button
	                    onClick={onOpenFavorites}
	                    className={`rounded-[24px] p-4 text-left transition active:scale-[0.98] ${
	                      isLight
	                        ? 'border border-slate-200 bg-white shadow-[0_12px_30px_rgba(148,163,184,0.14)]'
	                        : 'border border-white/10 bg-white/5'
	                    }`}
	                  >
	                    <StarIcon className="mb-3 h-7 w-7 text-amber-400" />
	                    <span className={`text-sm font-bold ${titleClass}`} style={isLight ? { color: '#0f172a' } : undefined}>{text.favoritesTitle}</span>
	                  </button>

	                  <button
	                    onClick={onOpenAccount}
	                    className={`rounded-[24px] p-4 text-left transition active:scale-[0.98] ${
	                      isLight
	                        ? 'border border-slate-200 bg-white shadow-[0_12px_30px_rgba(148,163,184,0.14)]'
	                        : 'border border-white/10 bg-white/5'
	                    }`}
	                  >
	                    {/* Les cartes elles-mêmes en guise d'icône, de face et
	                        empilées.

	                        Un pictogramme de portefeuille aurait dit « portefeuille » ;
	                        les cartes disent « vos cartes », qui est ce qu'on vient
	                        chercher — et leur nombre répond du même coup à la question
	                        qu'on se pose en ouvrant l'écran.

	                        Trois au plus : au-delà, le décalage sortirait de la
	                        vignette, et « beaucoup » se lit aussi bien sur trois. */}
	                    <span className="relative mb-3 block h-7">
	                      {Array.from({ length: Math.min(3, Math.max(1, walletCardCount)) }).map(
	                        (_, index) => (
	                          <img
	                            key={index}
	                            src="/assets/oura.png"
	                            alt=""
	                            draggable={false}
	                            className="absolute top-0 h-7 w-auto rounded-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.3)]"
	                            style={{ left: index * 9, zIndex: index }}
	                          />
	                        ),
	                      )}
	                    </span>
	                    <span className={`text-sm font-bold ${titleClass}`} style={isLight ? { color: '#0f172a' } : undefined}>{text.walletLabel}</span>
	                  </button>
	                  {onOpenLines && marqueeLines.length > 0 && (
	                    <button
	                      onClick={onOpenLines}
	                      className={`overflow-hidden rounded-[24px] p-4 text-left transition active:scale-[0.98] ${
	                        isLight
	                          ? 'border border-slate-200 bg-white shadow-[0_12px_30px_rgba(148,163,184,0.14)]'
	                          : 'border border-white/10 bg-white/5'
	                      }`}
	                    >
	                      <div className="mb-3">
	                        <LinesMarquee lines={marqueeLines} />
	                      </div>
	                      <span className={`text-sm font-bold ${titleClass}`} style={isLight ? { color: '#0f172a' } : undefined}>{text.linesLabel}</span>
	                    </button>
	                  )}
	                  {/* Qualité de l'air : un widget carré qui occupe les deux
	                      colonnes, sur le modèle des grandes vignettes iOS. Sa
	                      couleur est celle de l'indice du jour. */}
	                  <div className="col-span-2 aspect-square overflow-hidden rounded-[24px]">
	                    <AtmoPanel
	                      report={atmoReport}
	                      loading={atmoLoading}
	                      onCommuneChange={onAtmoCommuneChange}
	                      language={language}
	                      followMap={atmoFollowMap}
	                    />
	                  </div>
	                </div>
	              </section>
            </div>
          </div>
        </MapSheetBody>
        </Sheet.Content>
      </MapSheetShell>
      <SheetBackdrop onTap={collapseToMini} snapIdx={snapIdx} />

    </Sheet>
  );
};

/**
 * Invisible component mounted inside `Sheet.Content`. It runs a tight RAF
 * loop that reads the sheet container's bounding rect each frame and forwards
 * the normalized openness fraction to the parent via the *current* value of
 * `onSheetProgressRef`. Using a ref means this component never has to
 * remount when the parent re-renders, so the RAF loop runs continuously for
 * the entire lifetime of the sheet.
 */
function ProgressWatcher({
  onSheetProgressRef,
}: {
  onSheetProgressRef: React.MutableRefObject<((p: number) => void) | undefined>;
}) {
  useEffect(() => {
    let rafId = 0;
    let lastProgress = -1;

    const tick = () => {
      const containers = document.getElementsByClassName('react-modal-sheet-container');
      if (containers.length > 0) {
        const rect = (containers[0] as HTMLElement).getBoundingClientRect();
        const vh = window.innerHeight;
        const visibleHeight = Math.max(0, vh - rect.top);
        const progress = Math.min(1, Math.max(0, visibleHeight / vh));
        if (Math.abs(progress - lastProgress) > 0.001) {
          lastProgress = progress;
          onSheetProgressRef.current?.(progress);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onSheetProgressRef]);

  return null;
}
