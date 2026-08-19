import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRightIcon } from '@heroicons/react/24/solid';
import { MinimalScreen } from './MinimalScreen';
import { OuraCardFace } from './OuraCardFace';
import { TripHistoryScreen } from './TripHistoryScreen';
import type { OuraCard } from '../services/ouraCard';
import { AVATARS, listTrips, type Account, type AccountTrip } from '../services/account';

const PROFILE_ORBIT_MS = 110000;
const PROFILE_ORBIT_SIZE = 28;
const PROFILE_ORBIT_RADIUS = 72;

/**
 * Le profil : ce qu'on a rendu aux autres, et la carte qui le porte.
 *
 * Trois nombres, et l'historique qui les explique. Ni classement, ni niveau, ni
 * série à ne pas rompre : la contribution se constate, elle ne se dispute pas.
 */

/**
 * La taille du chiffre, décroissante avec sa longueur.
 *
 * Un compteur de trajets finit par passer à quatre chiffres, et « 10 673 » écrit
 * en 44 px pousse l'étiquette hors de la tuile. Trois paliers suffisent : au-delà
 * de six caractères, personne ne lit le nombre d'un coup d'œil de toute façon.
 */
function numberSize(value: string): string {
  if (value.length >= 7) return 'text-[26px]';
  if (value.length >= 5) return 'text-[32px]';
  return 'text-[40px]';
}

function monthAndYear(value: string | null, isFr: boolean): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric' });
}

export function ProfileScreen({
  isOpen,
  account,
  card,
  language,
  isLight,
  onBack,
}: {
  isOpen: boolean;
  account: Account | null;
  /** La carte qui porte le compte, si elle est encore dans le portefeuille. */
  card?: OuraCard | null;
  language: 'fr' | 'en';
  isLight: boolean;
  onBack: () => void;
}) {
  const isFr = language === 'fr';
  const ink = isLight ? 'text-slate-900' : 'text-white';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const tile = isLight ? 'bg-slate-200/70' : 'bg-slate-800';

  const [trips, setTrips] = useState<AccountTrip[]>([]);
  const [openTrip, setOpenTrip] = useState<AccountTrip | null>(null);
  const helpedFaces = useMemo(() => {
    const count = Math.min(Math.max(account?.travellersHelped ?? 0, 0), 5);
    return Array.from({ length: count }, (_, index) => ({
      emoji: AVATARS[index % AVATARS.length],
      angle: (index * 360) / count - 90,
    }));
  }, [account?.travellersHelped]);

  useEffect(() => {
    if (!isOpen || !account) return;
    void listTrips(account.cardCode).then(setTrips);
  }, [isOpen, account?.cardCode]);

  const stats = [
    {
      emoji: '🤝',
      label: isFr ? 'Utilisateurs aidés' : 'Travellers helped',
      value: (account?.travellersHelped ?? 0).toLocaleString('fr-FR'),
    },
    {
      emoji: '🚋',
      label: isFr ? 'Trajets réalisés sur GreLines' : 'Trips made with GreLines',
      value: (account?.trips ?? 0).toLocaleString('fr-FR'),
    },
    {
      emoji: '📅',
      label: isFr ? 'Sur GreLines depuis' : 'On GreLines since',
      value: monthAndYear(account?.createdAt ?? null, isFr),
    },
  ];

  return (
    <>
      <MinimalScreen isOpen={isOpen} title="" isLight={isLight} onBack={onBack}>
        <div className="flex flex-col items-center px-4 pt-2">
          {/* L'avatar en grand : c'est le seul élément qu'on a choisi soi-même, il
              mérite la place. */}
           <div className="relative flex h-44 w-44 items-center justify-center">
             <motion.div
               className="absolute inset-0"
               animate={{ rotate: 360 }}
               transition={{ duration: PROFILE_ORBIT_MS / 1000, repeat: Infinity, ease: 'linear' }}
               aria-hidden="true"
             >
               <AnimatePresence>
                 {helpedFaces.map((face) => (
                   <motion.span
                     key={`${face.emoji}-${face.angle}`}
                     className="absolute flex items-center justify-center rounded-full bg-white text-sm shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
                     style={{
                       width: PROFILE_ORBIT_SIZE,
                       height: PROFILE_ORBIT_SIZE,
                       left: `calc(50% + ${Math.cos((face.angle * Math.PI) / 180) * PROFILE_ORBIT_RADIUS}px - ${PROFILE_ORBIT_SIZE / 2}px)`,
                       top: `calc(50% + ${Math.sin((face.angle * Math.PI) / 180) * PROFILE_ORBIT_RADIUS}px - ${PROFILE_ORBIT_SIZE / 2}px)`,
                     }}
                     initial={{ opacity: 0, scale: 0.5 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.5 }}
                     transition={{ duration: 0.45, ease: 'easeOut' }}
                   >
                     <motion.span
                       animate={{ rotate: -360 }}
                       transition={{ duration: PROFILE_ORBIT_MS / 1000, repeat: Infinity, ease: 'linear' }}
                     >
                       {face.emoji}
                     </motion.span>
                   </motion.span>
                 ))}
               </AnimatePresence>
             </motion.div>
           <div
             className={`relative z-10 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 text-[52px] ${
              isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-white'
            }`}
          >
            {account?.avatarEmoji ? (
              <span aria-hidden>{account.avatarEmoji}</span>
            ) : card?.photoUrl ? (
              <img src={card.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden>🙂</span>
            )}
           </div>
           </div>

          <p className={`mt-4 text-[26px] font-extrabold leading-none ${ink}`}>
            {account?.pseudo ?? ''}
          </p>
          <p className={`mt-1.5 text-sm ${muted}`}>
            {[account?.firstName, account?.lastName].filter(Boolean).join(' ')}
          </p>
        </div>

        {/* Émoji puis étiquette sur deux lignes à gauche, le nombre à droite sur
            toute la hauteur : c'est lui qu'on vient lire, l'étiquette ne fait que
            dire de quoi il parle. */}
        <div className="mt-6 space-y-3 px-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`flex items-center justify-between gap-4 rounded-2xl px-4 py-5 ${tile}`}
            >
              <div className="min-w-0">
                <p className="text-xl leading-none" aria-hidden>
                  {stat.emoji}
                </p>
                <p
                  className={`mt-1.5 text-sm leading-snug ${
                    isLight ? 'text-slate-600' : 'text-slate-300'
                  }`}
                >
                  {stat.label}
                </p>
              </div>
              <span
                className={`tabular flex-shrink-0 font-extrabold leading-none ${numberSize(
                  stat.value
                )} ${ink}`}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        {/* La carte, de dos. Le recto est une image de marque ; le verso porte le
            nom, la photo et le numéro — c'est celui-là qui dit à qui appartient le
            compte. */}
        {card && (
          <div className="mt-8 px-4">
            <p className={`mb-3 px-1 text-sm font-bold ${ink}`}>
              {isFr ? 'Carte liée au compte' : 'Card linked to the account'}
            </p>
            <OuraCardFace
              firstName={card.firstName}
              lastName={card.lastName}
              cardCode={card.cardCode}
              expiresAt={card.expiresAt}
              photoUrl={card.photoUrl}
              className={isLight ? 'shadow-[0_10px_28px_rgba(15,23,42,0.10)]' : 'shadow-2xl'}
            />
          </div>
        )}

        {/* L'historique. Un compteur qu'on ne peut pas ouvrir ne veut rien dire :
            on ne sait pas s'il compte juste, ni ce qu'il a compté. */}
        <div className="mt-8 px-4 pb-6">
          <p className={`mb-5 px-1 text-sm font-bold ${ink}`}>
            {isFr ? 'Historique des trajets' : 'Trip history'}
          </p>

          {trips.length === 0 ? (
            <p className={`rounded-2xl px-4 py-6 text-center text-sm ${tile} ${muted}`}>
              {isFr
                ? 'Aucun trajet pour l’instant. Ils apparaîtront ici à mesure.'
                : 'No trips yet. They will show up here as you go.'}
            </p>
          ) : (
            <div className="space-y-2">
              {trips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => setOpenTrip(trip)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ${tile}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-bold ${ink}`}>
                      {trip.destination || (isFr ? 'Trajet' : 'Trip')}
                    </p>
                    <p className={`tabular mt-0.5 truncate text-xs ${muted}`}>
                      {new Date(trip.createdAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {trip.legs.length > 0 && ` · ${trip.legs.map((leg) => leg.line).join(' → ')}`}
                    </p>
                  </div>
                  <ChevronRightIcon className={`h-4 w-4 flex-shrink-0 ${muted}`} />
                </button>
              ))}
            </div>
          )}
        </div>
      </MinimalScreen>

      <TripHistoryScreen
        trip={openTrip}
        language={language}
        isLight={isLight}
        onBack={() => setOpenTrip(null)}
      />
    </>
  );
}
