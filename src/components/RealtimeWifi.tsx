/**
 * Le signe que l'horaire vient du véhicule, et non de la fiche.
 *
 * C'était un mot — « en direct », précédé d'une puce verte — répété sur chaque
 * ligne de la liste. Un mot occupe la place d'une destination, se traduit, et
 * se lit alors qu'il n'y a rien à lire : ou bien l'horaire est en direct, ou
 * bien il ne l'est pas. Un pictogramme le dit sans rien coûter à la ligne.
 *
 * Les quatre arcs se remplissent du plus court au plus long, comme un signal
 * qui s'établit, et la séquence se rejoue toutes les trois secondes. Un signal
 * qui bat, c'est ce que veut dire « en direct » ; figé, il ne prouve rien.
 *
 * Le glyphe est couché d'un quart de tour puis retourné : ses arcs s'ouvrent
 * vers le haut à gauche. Debout, il se lisait comme l'icône du réseau sans fil
 * de la barre d'état, et l'on cherchait un rapport avec la connexion.
 *
 * Au repos, les quatre arcs sont visibles : si l'animation ne se joue pas —
 * mouvement réduit, moteur absent, appareil poussif —, il ne manque que le
 * battement, jamais le pictogramme.
 */

import { useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';

/** Les arcs, du plus proche au plus lointain. Chacun entre à son tour. */
const WIFI_LEVELS = [
  { d: 'M12 20h.01', delay: 0 },
  { d: 'M8.5 16.429a5 5 0 0 1 7 0', delay: 0.1 },
  { d: 'M5 12.859a10 10 0 0 1 14 0', delay: 0.2 },
  { d: 'M2 8.82a15 15 0 0 1 20 0', delay: 0.3 },
];

/** L'intervalle entre deux battements. */
const PULSE_MS = 3000;

export interface RealtimeWifiProps {
  size?: number;
  className?: string;
  /** Ce que dit le lecteur d'écran, à qui la rotation d'un arc n'apprend rien. */
  label?: string;
}

export function RealtimeWifi({ size = 14, className = '', label }: RealtimeWifiProps) {
  const controls = useAnimation();

  useEffect(() => {
    let cancelled = false;
    const beat = async () => {
      await controls.start('fadeOut');
      if (!cancelled) controls.start('fadeIn');
    };
    void beat();
    const timer = window.setInterval(beat, PULSE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [controls]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 ${className}`}
      /* Couché puis retourné : le miroir se pose après la rotation, sans quoi
         il la renverrait dans l'autre sens. */
      style={{ transform: 'scaleX(-1) rotate(-45deg)' }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {WIFI_LEVELS.map((level, index) => (
        <motion.path
          key={level.d}
          d={level.d}
          animate={controls}
          initial={{ opacity: 1 }}
          variants={{
            /* Le premier point reste : c'est l'émetteur, il ne clignote pas. */
            fadeOut: { opacity: index === 0 ? 1 : 0, transition: { duration: 0.2 } },
            fadeIn: {
              opacity: 1,
              transition: { type: 'spring', stiffness: 300, damping: 20, delay: level.delay },
            },
          }}
        />
      ))}
    </svg>
  );
}
