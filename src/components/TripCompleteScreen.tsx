import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/solid';
import Confetti from 'react-confetti-boom';
import { isRoundLine } from './LineBadge';
import type { TripAward } from '../services/greLinesPoints';
import { AVATARS, type Account } from '../services/account';


const CONFETTI_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#a855f7'];

const CLOUD_FACES = AVATARS;

const CLOUD_SLOTS = 5;
const FACE_LIFETIME_MS = 14000;
const FACE_SIZE = 40;
const MIN_GAP = FACE_SIZE + 5;

function facePoint(angle: number, radius: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}

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

const SPIN_MS = 100000;

interface CloudFace {
  key: number;
  emoji: string;
  angle: number;
  radius: number;
  spunBy: number;
}

interface TripCompleteScreenProps {
  isOpen: boolean;
  onClose: () => void;
  award: TripAward | null;
  showPoints?: boolean;
  language: 'fr' | 'en';
  account?: Account | null;
  photoUrl?: string | null;
  lines?: Array<{ label: string; color: string }>;
  origin?: string;
  destination?: string;
}

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

  const confettiKey = useMemo(() => Date.now(), [isOpen]);

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

    const initial: CloudFace[] = [];
    for (let i = 0; i < slots; i++) initial.push(draw(initial));
    setCloud(initial);

    const timer = window.setInterval(() => {
      setCloud((current) => {
        if (current.length === 0) return current;
        const index = Math.floor(Math.random() * current.length);
        const next = [...current];
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
          <div className="pointer-events-none absolute inset-0 z-10" key={confettiKey}>
            <Confetti
              mode="fall"
              particleCount={120}
              shapeSize={14}
              colors={CONFETTI_COLORS}
              fadeOutHeight={0.9}
            />
          </div>

          <button
            onClick={onClose}
            className="absolute right-4 top-[max(1rem,var(--gl-safe-top))] z-30 flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:scale-95"
            aria-label={isFr ? 'Fermer' : 'Close'}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

          <div className="relative z-20 flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-[max(4.5rem,var(--gl-safe-top))]">
            <motion.p
              className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              {isFr ? 'Trajet terminé' : 'Trip complete'}
            </motion.p>

            <motion.div
              className="mt-2 w-full max-w-[22rem]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <ScrollingTitle>
                <span className="text-[1.375rem] font-black leading-tight text-white">
                  {origin || (isFr ? 'Départ' : 'Start')}
                </span>
                <ArrowsRightLeftIcon className="h-5 w-5 flex-shrink-0 text-slate-500" />
                <span className="text-[1.375rem] font-black leading-tight text-white">
                  {destination || (isFr ? 'Arrivée' : 'Arrival')}
                </span>
              </ScrollingTitle>
            </motion.div>

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

            <div className={`relative mt-8 flex h-64 w-64 items-center justify-center ${account ? '' : 'pointer-events-none'}`}>
              {account && (
              <motion.div
                className="absolute inset-0 z-10"
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
                className="relative z-0 flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white text-[4rem] shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
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
                  <span className="tabular text-[2.75rem] font-black leading-none text-white">
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

          <motion.div
            className="relative z-20 border-t border-slate-800 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
          >
            <p className="tabular text-[2rem] font-black leading-none text-emerald-400">
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
