import { OfflinePanel } from './OfflinePanel';
import { useIsOffline } from '../hooks/useIsOffline';
import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MinimalScreen } from './MinimalScreen';
import { OuraCardFace } from './OuraCardFace';
import type { OuraCard } from '../services/ouraCard';
import { AVATARS, type Account } from '../services/account';

const PROFILE_ORBIT_MS = 110000;
const PROFILE_ORBIT_SIZE = 28;
const PROFILE_ORBIT_RADIUS = 72;


function numberSize(value: string): string {
  if (value.length >= 7) return 'text-[1.625rem]';
  if (value.length >= 5) return 'text-[2rem]';
  return 'text-[2.5rem]';
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
  card?: OuraCard | null;
  language: 'fr' | 'en';
  isLight: boolean;
  onBack: () => void;
}) {
  const isFr = language === 'fr';
  const offline = useIsOffline();
  const ink = isLight ? 'text-slate-900' : 'text-white';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const tile = isLight ? 'bg-slate-200/70' : 'bg-slate-800';

  const helpedFaces = useMemo(() => {
    const helped = Math.max(account?.travellersHelped ?? 0, 0);
    const count = Math.min(helped, 8);
    if (count === 0) return [];

    const seed = [...(account?.cardCode ?? '')].reduce(
      (total, char) => total + char.charCodeAt(0),
      0,
    );

    return Array.from({ length: count }, (_, index) => ({
      emoji: AVATARS[(seed + index * 7) % AVATARS.length],
      angle: (index * 360) / count - 90,
    }));
  }, [account?.travellersHelped, account?.cardCode]);

  useEffect(() => {
    if (!isOpen || !account) return;
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
        {offline ? (
          <OfflinePanel
            language={language}
            isLight={isLight}
            detail={isFr
              ? 'Votre compte s’affichera au retour du réseau.'
              : 'Your account will show once you are back online.'}
          />
        ) : (
        <>
        <div className="flex flex-col items-center px-4 pt-2">
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
             className={`relative z-10 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 text-[3.25rem] ${
              isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-white'
            }`}
          >
            {account?.avatarUrl ? (
              <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : account?.avatarEmoji ? (
              <span aria-hidden>{account.avatarEmoji}</span>
            ) : card?.photoUrl ? (
              <img src={card.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden>🙂</span>
            )}
           </div>
           </div>

          <div className="mt-5 text-center">
            <p className={`text-sm font-medium ${muted}`}>
              {[account?.firstName, account?.lastName].filter(Boolean).join(' ')}
            </p>
          </div>
          <div className="mt-1.5 text-center">
            <p className={`text-[1.625rem] font-extrabold leading-none ${ink}`}>
              {account?.pseudo ?? ''}
            </p>
          </div>
        </div>

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
                <div className="mt-3">
                  <p
                    className={`text-sm leading-snug ${
                      isLight ? 'text-slate-600' : 'text-slate-300'
                    }`}
                  >
                    {stat.label}
                  </p>
                </div>
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
              shadowClassName={isLight ? 'shadow-[0_10px_28px_rgba(15,23,42,0.10)]' : 'shadow-2xl'}
            />
          </div>
        )}

        </>
        )}
      </MinimalScreen>

    </>
  );
}
