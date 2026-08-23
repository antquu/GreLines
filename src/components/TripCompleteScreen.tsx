import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/solid';
import Confetti from 'react-confetti-boom';
import { isRoundLine } from './LineBadge';
import type { TripAward } from '../services/greLinesPoints';
import { AVATARS, type Account } from '../services/account';

/**
 * L'écran de fin de trajet.
 *
 * Arriver ne produisait rien : le guidage se fermait sur un écran noir, et le
 * travail que l'usager venait de faire — laisser son guidage ouvert, répondre à
 * une question dans le tram — disparaissait sans trace. Cet écran lui rend ce
 * qu'il a donné : son visage, ses points, et les voyageurs que ses relevés ont
 * renseignés.
 *
 * Il monte depuis le bas et s'en va par le bas : le trajet se referme dans le
 * sens où il s'est ouvert.
 */

/** Les couleurs de l'application, pour que les confettis lui appartiennent. */
const CONFETTI_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#a855f7'];

/**
 * Les visages du nuage : les voyageurs qu'on vient de renseigner.
 *
 * Ils sont anonymes, et doivent le rester — personne n'a demandé à figurer sur
 * l'écran d'un inconnu. Ce ne sont donc pas de vrais profils mais des émojis
 * tirés au sort, qui représentent un nombre sans désigner quiconque : la seule
 * information vraie ici est le compte, et il est juste.
 *
 * Ce sont les mêmes que ceux qu'on peut se choisir comme avatar. Une liste à part
 * ne donnait que des têtes, si bien que le nuage ne ressemblait pas aux profils de
 * l'application : on y voyait des figurants, pas des voyageurs.
 */
const CLOUD_FACES = AVATARS;

/**
 * Combien de visages tournent en même temps.
 *
 * Un nombre fixe, et non le compte réel des voyageurs renseignés : ce dernier
 * valait souvent un ou deux, et deux émojis sur un cercle de deux cent
 * cinquante pixels ne font pas un nuage, ils font deux points perdus. Le nuage
 * dit qu'il y a du monde ; le nombre exact est écrit en pied d'écran, où il ne
 * peut pas être confondu avec une illustration.
 */
const CLOUD_SLOTS = 5;
/**
 * Combien de temps un visage reste avant de céder sa place.
 *
 * Quatorze secondes : à cinq, cela fait un changement toutes les trois secondes
 * environ. À cinq secondes de vie, le nuage se renouvelait entièrement le temps
 * qu'on lise l'écran, et l'agitation ramenait le regard sur le décor au lieu du
 * nombre.
 */
const FACE_LIFETIME_MS = 14000;
/**
 * Écart minimal entre deux visages, de centre à centre.
 *
 * Le diamètre d'un visage plus cinq pixels : deux émojis tirés au hasard
 * tombaient parfois presque au même endroit, se chevauchaient, et donnaient une
 * tache au lieu de deux personnes. Cinq pixels suffisent à les séparer sans
 * imposer une grille — le nuage doit rester irrégulier.
 */
const FACE_SIZE = 40;
const MIN_GAP = FACE_SIZE + 5;

/**
 * Convertit une place de l'anneau en coordonnées, pour mesurer les écarts.
 *
 * Deux visages proches en angle mais éloignés en rayon ne se touchent pas : on ne
 * peut donc pas comparer les angles, il faut passer par le plan.
 */
function facePoint(angle: number, radius: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}

/**
 * Cherche une place assez à l'écart des autres.
 *
 * Vingt essais, puis on garde le meilleur trouvé : une boucle sans issue est
 * toujours possible quand la couronne est pleine, et un nuage un peu serré vaut
 * mieux qu'une image qui se figera.
 */
function spacedSlot(
  taken: Array<{ angle: number; radius: number }>
): { angle: number; radius: number } {
  let best = { angle: 0, radius: 0 };
  let bestDistance = -1;

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = { angle: Math.random() * 360, radius: 92 + Math.random() * 34 };
    const point = facePoint(candidate.angle, candidate.radius);
    let nearest = Infinity;
    for (const other of taken) {
      const otherPoint = facePoint(other.angle, other.radius);
      nearest = Math.min(nearest, Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y));
    }
    if (nearest >= MIN_GAP) return candidate;
    if (nearest > bestDistance) {
      bestDistance = nearest;
      best = candidate;
    }
  }
  return best;
}

/**
 * Durée d'un tour de l'anneau.
 *
 * Partagée avec la contre-rotation des visages : les deux doivent tourner à la
 * même vitesse, sinon les émojis dérivent lentement au lieu de rester droits.
 */
const SPIN_MS = 100000;

interface CloudFace {
  key: number;
  emoji: string;
  /** Position sur l'anneau, en degrés. */
  angle: number;
  /** Distance au centre : une couronne épaisse, pas un cadran d'horloge. */
  radius: number;
  /**
   * Où en était l'anneau quand ce visage est apparu, en degrés.
   *
   * Sert à démarrer sa contre-rotation au bon endroit. Sans ça, un visage qui
   * paraît au bout de trente secondes commencerait à zéro pendant que l'anneau
   * est à cent huit degrés, et resterait penché de cet écart pour toujours.
   */
  spunBy: number;
}

interface TripCompleteScreenProps {
  isOpen: boolean;
  onClose: () => void;
  award: TripAward | null;
  /**
   * Faut-il annoncer des points.
   *
   * Sans compte, ils n'ont nulle part où s'accumuler : les afficher serait une
   * promesse en l'air, et découvrir plus tard qu'ils n'ont jamais été gardés est
   * pire que ne les avoir jamais vus. Le nombre de voyageurs renseignés reste,
   * lui, puisqu'il décrit ce trajet-là et non un cumul.
   */
  showPoints?: boolean;
  language: 'fr' | 'en';
  /**
   * Le compte, s'il existe.
   *
   * C'est son avatar qu'on montre, plus la carte OURA : la carte sert à valider,
   * elle ne dit rien de ce qu'on vient d'accomplir. Le visage qu'on s'est choisi,
   * si.
   */
  account?: Account | null;
  /** La photo de la carte, quand le compte n'a pas d'émoji. */
  photoUrl?: string | null;
  /** Les lignes empruntées, dans l'ordre, avec leur couleur. */
  lines?: Array<{ label: string; color: string }>;
  origin?: string;
  destination?: string;
}

/**
 * Un titre qui défile quand il ne tient pas.
 *
 * Même principe que le bandeau d'infotrafic : on mesure, et l'on ne fait défiler
 * que si c'est nécessaire. Tronquer « Grenoble, Hôpital Couple Enfant » à
 * « Grenoble, Hôpi… » cache justement ce qui distingue deux arrêts voisins.
 */
function ScrollingTitle({ children }: { children: React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const element = trackRef.current;
    if (!element) return;
    const measure = () => {
      const parent = element.parentElement;
      if (!parent) return;
      setOverflow(Math.max(0, element.scrollWidth - parent.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);

  return (
    <div className="w-full overflow-hidden">
      <motion.div
        ref={trackRef}
        className="flex w-max items-center gap-2.5"
        animate={overflow > 0 ? { x: [0, -overflow, -overflow, 0] } : { x: 0 }}
        transition={
          overflow > 0
            ? {
                // Un temps d'arrêt à chaque bout : un texte qui défile sans pause
                // ne se lit pas, on court après son début.
                duration: overflow / 28 + 2,
                times: [0, 0.45, 0.55, 1],
                repeat: Infinity,
                repeatDelay: 1,
                ease: 'linear',
              }
            : { duration: 0 }
        }
      >
        {children}
      </motion.div>
    </div>
  );
}

export function TripCompleteScreen({
  isOpen,
  onClose,
  award,
  showPoints = true,
  language,
  account,
  photoUrl,
  lines = [],
  origin,
  destination,
}: TripCompleteScreenProps) {
  const isFr = language === 'fr';

  // La graine des confettis ne doit pas changer à chaque rendu, sans quoi ils
  // repartiraient du haut dès que le composant se redessine.
  const confettiKey = useMemo(() => Date.now(), [isOpen]);

  /**
   * Le nuage, renouvelé visage par visage.
   *
   * Chacun paraît, reste quelques secondes, s'en va, et un autre prend une place
   * différente. Un anneau figé aurait été un décor ; celui-là respire, et
   * suggère un flux de gens plutôt qu'une liste — ce qui est plus juste, puisque
   * ces voyageurs ne sont pas huit personnes identifiables mais un nombre.
   */
  const [cloud, setCloud] = useState<CloudFace[]>([]);
  const seedRef = useRef(0);

  useEffect(() => {
    if (!isOpen || !award) {
      setCloud([]);
      return;
    }
    const slots = award.travellersHelped > 0 ? CLOUD_SLOTS : 0;
    if (slots === 0) return;

    const startedAt = Date.now();
    const draw = (taken: Array<{ angle: number; radius: number }>): CloudFace => {
      const slot = spacedSlot(taken);
      return {
        key: seedRef.current++,
        emoji: CLOUD_FACES[Math.floor(Math.random() * CLOUD_FACES.length)],
        angle: slot.angle,
        radius: slot.radius,
        spunBy: (((Date.now() - startedAt) % SPIN_MS) / SPIN_MS) * 360,
      };
    };

    // Le remplissage initial se fait de proche en proche : chaque visage voit
    // ceux déjà posés, sinon rien ne les empêcherait de tomber au même endroit.
    const initial: CloudFace[] = [];
    for (let i = 0; i < slots; i++) initial.push(draw(initial));
    setCloud(initial);

    /*
     * On remplace un seul visage à la fois, à intervalle régulier.
     *
     * Tous les renouveler ensemble aurait fait clignoter le nuage entier toutes
     * les cinq secondes. Espacés, les départs se croisent et le mouvement ne
     * s'arrête jamais.
     */
    const timer = window.setInterval(() => {
      setCloud((current) => {
        if (current.length === 0) return current;
        const index = Math.floor(Math.random() * current.length);
        const next = [...current];
        // Le nouveau visage évite tous les autres, celui qu'il remplace excepté :
        // sa place se libère à l'instant même.
        next[index] = draw(current.filter((_, i) => i !== index));
        return next;
      });
    }, Math.max(600, FACE_LIFETIME_MS / slots));

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, award?.travellersHelped]);

  return (
    <AnimatePresence>
      {isOpen && award && (
        <motion.div
          className="fixed inset-0 z-[10100] flex flex-col overflow-hidden bg-[#0a1420]"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 260, damping: 32 }}
        >
          {/* Les confettis tombent du haut, par-dessus tout mais sans rien
              intercepter : on doit pouvoir fermer pendant qu'ils tombent. */}
          <div className="pointer-events-none absolute inset-0 z-10" key={confettiKey}>
            <Confetti
              mode="fall"
              particleCount={120}
              shapeSize={14}
              colors={CONFETTI_COLORS}
              fadeOutHeight={0.9}
            />
          </div>

          {/* La croix garde sa place exacte : celle qu'elle occupait pendant le
              guidage, pour que le geste de sortie ne se réapprenne pas. */}
          <button
            onClick={onClose}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:scale-95"
            aria-label={isFr ? 'Fermer' : 'Close'}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

          <div className="relative z-20 flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-[max(4.5rem,env(safe-area-inset-top))]">
            <motion.p
              className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              {isFr ? 'Trajet terminé' : 'Trip complete'}
            </motion.p>

            {/* Départ ⇄ arrivée. Le nom seul de la destination ne dit pas d'où
                l'on vient, et deux trajets vers la même gare ne se ressemblent
                pas forcément. */}
            <motion.div
              className="mt-2 w-full max-w-[22rem]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <ScrollingTitle>
                <span className="text-[22px] font-black leading-tight text-white">
                  {origin || (isFr ? 'Départ' : 'Start')}
                </span>
                <ArrowsRightLeftIcon className="h-5 w-5 flex-shrink-0 text-slate-500" />
                <span className="text-[22px] font-black leading-tight text-white">
                  {destination || (isFr ? 'Arrivée' : 'Arrival')}
                </span>
              </ScrollingTitle>
            </motion.div>

            {/* Les badges des lignes, dans la forme du réseau : ronde pour les
                trams et les chronos, carrée pour le reste. Un badge carré sur la
                ligne A ne se reconnaît pas. */}
            {lines.length > 0 && (
              <motion.div
                className="mt-3 flex flex-wrap items-center justify-center gap-1.5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.36 }}
              >
                {lines.map((line, index) => (
                  <span
                    key={`${line.label}-${index}`}
                    className={`flex h-8 min-w-[2rem] items-center justify-center px-2 text-sm font-black text-white ${
                      isRoundLine(line.label) ? 'rounded-full' : 'rounded-lg'
                    }`}
                    style={{ backgroundColor: line.color }}
                  >
                    {line.label}
                  </span>
                ))}
              </motion.div>
            )}

            {/* L'avatar, fixe, et le nuage qui tourne autour.
                Le visage ne bouge pas : c'est le point d'ancrage, et le voir
                dériver donnerait le sentiment de flotter. Ce sont les autres qui
                passent. */}
            <div className={`relative mt-8 flex h-64 w-64 items-center justify-center ${account ? '' : 'pointer-events-none'}`}>
              {account && (
              <motion.div
                className="absolute inset-0 z-10"
                // Un tour en cent secondes : assez pour qu'on le remarque en
                // regardant, trop lent pour qu'on le suive des yeux.
                animate={{ rotate: 360 }}
                transition={{ duration: SPIN_MS / 1000, repeat: Infinity, ease: 'linear' }}
              >
                <AnimatePresence>
                  {cloud.map((face) => (
                    <motion.span
                      key={face.key}
                      className="absolute flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
                      style={{
                        left: `calc(50% + ${
                          Math.cos((face.angle * Math.PI) / 180) * face.radius
                        }px - 1.25rem)`,
                        top: `calc(50% + ${
                          Math.sin((face.angle * Math.PI) / 180) * face.radius
                        }px - 1.25rem)`,
                      }}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ duration: 1.1, ease: 'easeInOut' }}
                      aria-hidden
                    >
                      {/* Le visage tient droit pendant que l'anneau tourne.
                          Un émoji qui pivote avec la couronne finit la tête en bas
                          au bout d'un demi-tour ; celui-ci défait exactement la
                          rotation du parent, en partant de là où l'anneau était
                          quand il est apparu. */}
                      <motion.span
                        className="block"
                        animate={{ rotate: [-face.spunBy, -face.spunBy - 360] }}
                        transition={{ duration: SPIN_MS / 1000, repeat: Infinity, ease: 'linear' }}
                      >
                        {face.emoji}
                      </motion.span>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </motion.div>
              )}

              <motion.div
                className="relative z-0 flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white text-[64px] shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 240, damping: 20, delay: 0.2 }}
              >
                {account?.avatarUrl ? (
                  <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : account?.avatarEmoji ? (
                  <span aria-hidden>{account.avatarEmoji}</span>
                ) : photoUrl ? (
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden>🙂</span>
                )}
              </motion.div>
            </div>

            {showPoints && (
              <>
                <motion.div
                  className="mt-6 flex items-baseline gap-2"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.45 }}
                >
                  <span className="tabular text-[44px] font-black leading-none text-white">
                    +{award.points}
                  </span>
                  <span className="text-base font-bold text-slate-300">GreLines Points</span>
                </motion.div>

                <motion.p
                  className="tabular mt-1 text-sm text-slate-400"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.55 }}
                >
                  {isFr
                    ? `${award.total.points} points au total · +1 trajet`
                    : `${award.total.points} points in total · +1 trip`}
                </motion.p>
              </>
            )}
          </div>

          {/* Le compte des voyageurs renseignés ferme l'écran : c'est la seule
              ligne qui parle des autres, et c'est celle qui donne envie de
              laisser le guidage ouvert la fois suivante. */}
          <motion.div
            className="relative z-20 border-t border-slate-800 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
          >
            <p className="tabular text-[32px] font-black leading-none text-emerald-400">
              {award.travellersHelped}
            </p>
            <p className="mt-1.5 text-sm text-slate-300">
              {isFr
                ? award.travellersHelped > 1
                  ? 'voyageurs renseignés grâce à ce trajet'
                  : 'voyageur renseigné grâce à ce trajet'
                : award.travellersHelped > 1
                ? 'travellers informed by this trip'
                : 'traveller informed by this trip'}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
