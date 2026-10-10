import { AnimatePresence, motion } from 'framer-motion';
import { MapPinIcon } from '@heroicons/react/24/solid';
import { useEffect, useState } from 'react';
import { CITY_SITE, CITY_SITES, SITE_CENTER } from '../site';
import { locateByIp } from '../services/ipLocation';
import { haversineMeters } from '../utils/geo';
import { onDevCommand } from '../utils/devCommands';
import { tx } from '../i18n';

const STAY_KEY = `greLines_${CITY_SITE?.id ?? 'city'}StayOutside`;
const GRELINES_URL = 'https://grelines.fr/app';

function otherCities(): string {
  const names = ['Grenoble', ...Object.values(CITY_SITES).filter(site => site.id !== CITY_SITE?.id).map(site => site.name), 'Annecy'];
  return names.join(', ');
}

function hasChosenToStay(): boolean {
  try {
    return localStorage.getItem(STAY_KEY) === 'true';
  } catch {
    return false;
  }
}

function isInsideArea(point: { lat: number; lon: number }): boolean {
  return haversineMeters(point.lat, point.lon, SITE_CENTER.lat, SITE_CENTER.lon) <= (CITY_SITE?.areaRadiusMeters ?? 35_000);
}

export function CityAreaPrompt({
  position,
  isMobile,
  language,
  theme = 'dark',
}: {
  position: { lat: number; lon: number } | null;
  isMobile: boolean;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
}) {
  const [stayed, setStayed] = useState(hasChosenToStay);
  const [ipArea, setIpArea] = useState<{ lat: number; lon: number } | null>(null);
  const [forced, setForced] = useState(false);

  useEffect(() => {
    if (!CITY_SITE) return;
    return onDevCommand('show.outside', () => {
      setStayed(false);
      setForced(true);
    });
  }, []);

  useEffect(() => {
    if (!CITY_SITE || stayed) return;
    let alive = true;
    void locateByIp().then(area => { if (alive) setIpArea(area); });
    return () => { alive = false; };
  }, [stayed]);

  if (!CITY_SITE || stayed) return null;

  const known = position ?? ipArea;
  const open = forced || (known !== null && !isInsideArea(known));

  const isFr = language === 'fr';
  const isLight = theme === 'light';
  const ink = isLight ? '#000000' : '#ffffff';
  const soft = isLight ? '#525252' : '#a3a3a3';
  const faint = '#737373';
  const surface = isLight ? '#ffffff' : isMobile ? 'rgb(var(--gl-sheet-rgb))' : '#0b0b0b';

  const stay = () => {
    try {
      localStorage.setItem(STAY_KEY, 'true');
    } catch {
    }
    setForced(false);
    setStayed(true);
  };

  const content = (
    <div className={`px-6 ${isMobile ? 'pt-7' : 'pt-7 pb-8'}`}>
      <MapPinIcon className="h-12 w-12" style={{ color: ink }} aria-hidden="true" />
      <p role="heading" aria-level={2} className="pt-6 text-[1.625rem] font-medium leading-[1.15]" style={{ color: ink }}>
        {tx(isFr).cityAreaPrompt.notInCity(CITY_SITE.name)}
      </p>
      <p className="pt-3 text-[1.0625rem] leading-snug" style={{ color: soft }}>
        {tx(isFr).cityAreaPrompt.youAreOnGrelines(CITY_SITE.name, CITY_SITE.networkLabel)}
      </p>
      <p className="pt-3 text-[1.0625rem] leading-snug" style={{ color: soft }}>
        {tx(isFr).cityAreaPrompt.grelinesAlsoCovers(otherCities())}
      </p>
      <a
        href={GRELINES_URL}
        className="mt-8 block w-full rounded-2xl py-4 text-center text-[1.0625rem] font-semibold transition active:scale-[0.98]"
        style={isLight ? { backgroundColor: '#000000', color: '#ffffff' } : { backgroundColor: '#ffffff', color: '#000000' }}
      >
        {tx(isFr).cityAreaPrompt.continueOnGrelinesFr}
      </a>
      <button
        type="button"
        onClick={stay}
        className="mt-3 w-full py-1 text-[0.875rem] underline-offset-4 transition hover:underline active:opacity-70"
        style={{ color: faint }}
      >
        {tx(isFr).cityAreaPrompt.stayOnSite(CITY_SITE.name)}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            key="city-area"
            className="fixed inset-0 z-[10050] flex flex-col justify-end bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              className={`mx-2 mb-2 overflow-hidden border ${isLight ? 'border-slate-200' : 'border-white/10'}`}
              style={{
                backgroundColor: surface,
                borderRadius: 30,
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
            >
              {content}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="city-area"
          className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`w-full max-w-sm overflow-hidden rounded-3xl border shadow-2xl ${isLight ? 'border-slate-200' : 'border-white/10'}`}
            style={{ backgroundColor: surface }}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
          >
            {content}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
