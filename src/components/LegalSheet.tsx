import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRightIcon, DocumentTextIcon, ShieldCheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { MapSheet, MapSheetBottomSpacer } from './MapSheet';
import { openExternal } from '../utils/openExternal';

interface LegalSheetProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  isMobile: boolean;
}

interface Section {
  title: string;
  paragraphs: string[];
}

const getContent = (language: 'fr' | 'en'): { tabs: [string, string]; data: Section[]; terms: Section[]; sources: Array<{ label: string; url: string }>; updated: string } => {
  if (language === 'en') {
    return {
      tabs: ['Your data', 'Terms'],
      updated: 'Last updated: February 2026',
      data: [
        {
          title: 'No account, no profile',
          paragraphs: [
            'GreLines has no sign-up and no login. Your favourites, saved journeys, search history and settings live in your browser’s local storage, on this device only. Nothing is sent to us, and clearing the app data erases all of it.',
            'We do not build a profile of you, we do not sell anything, and we run no advertising tracker.',
          ],
        },
        {
          title: 'What leaves the device',
          paragraphs: [
            'Requests for timetables, routes, disruptions and air quality go to the transport operators’ own APIs. They see the request (a stop, two coordinates) as any browser visiting their service would.',
            'Map tiles are served by MapTiler, addresses by the French national address base. Anonymous audience measurement is provided by Vercel, without cookies.',
            'Your location, when you allow it, never leaves the device: it is used to draw the map and sort nearby stops.',
          ],
        },
        {
          title: 'Transport cards',
          paragraphs: [
            'A card added to the wallet is the only case where something is stored on a server. The number, the holder’s name and photo are kept in our database, attached to a random device identifier, not to you.',
            'The photo is there so an inspector can match the card to its holder. Removing a card from this device unlinks it; the holder record remains so the same number can be found again from another device.',
          ],
        },
      ],
      terms: [
        {
          title: 'Free, and as-is',
          paragraphs: [
            'GreLines is free and carries no purchase. It is an independent project and is not published, endorsed or operated by any transport authority.',
            'Times, disruptions and routes come from third-party services and can be wrong, late or unavailable. Check with the operator before relying on them for anything that matters.',
          ],
        },
        {
          title: 'Fair use',
          paragraphs: [
            'Use the app for planning your own trips. Do not scrape it, do not automate requests through it, and do not redistribute the operators’ data under your own name.',
          ],
        },
      ],
      sources: [
        { label: 'Mobilités M, open data', url: 'https://data.mobilites-m.fr/' },
        { label: 'ATMO Auvergne-Rhône-Alpes', url: 'https://www.atmo-auvergnerhonealpes.fr/' },
        { label: 'Base Adresse Nationale', url: 'https://adresse.data.gouv.fr/' },
        { label: 'MapTiler', url: 'https://www.maptiler.com/copyright/' },
      ],
    };
  }

  return {
    tabs: ['Vos données', 'Conditions'],
    updated: 'Dernière mise à jour : février 2026',
    data: [
      {
        title: 'Pas de compte, pas de profil',
        paragraphs: [
          'GreLines n’a ni inscription ni connexion. Vos favoris, vos trajets, votre historique de recherche et vos réglages vivent dans le stockage local de votre navigateur, sur cet appareil et nulle part ailleurs. Rien ne nous parvient, et « Effacer les données » les supprime tous.',
          'Nous ne constituons aucun profil, nous ne vendons rien, et l’application ne contient aucun traceur publicitaire.',
        ],
      },
      {
        title: 'Ce qui quitte l’appareil',
        paragraphs: [
          'Les demandes d’horaires, d’itinéraires, de perturbations et de qualité de l’air partent vers les interfaces des exploitants eux-mêmes. Ils voient la requête (un arrêt, deux coordonnées) comme n’importe quel navigateur consultant leur service.',
          'Le fond de carte est servi par MapTiler, les adresses par la Base Adresse Nationale. La mesure d’audience, anonyme et sans cookie, est assurée par Vercel.',
          'Votre position, quand vous l’autorisez, ne quitte jamais l’appareil : elle sert à centrer la carte et à trier les arrêts autour de vous.',
        ],
      },
      {
        title: 'Les cartes de transport',
        paragraphs: [
          'Une carte ajoutée au portefeuille est le seul cas où quelque chose est conservé sur un serveur. Le numéro, le nom du porteur et sa photo sont gardés dans notre base, rattachés à un identifiant d’appareil tiré au sort, pas à vous.',
          'La photo est là pour qu’un contrôleur puisse rapprocher la carte de son porteur. Retirer une carte de cet appareil la détache ; la fiche du porteur reste, afin de retrouver le même numéro depuis un autre téléphone.',
        ],
      },
    ],
    terms: [
      {
        title: 'Gratuit, et tel quel',
        paragraphs: [
          'GreLines est gratuite et ne donne lieu à aucun achat. C’est un projet indépendant : elle n’est ni éditée, ni approuvée, ni exploitée par une autorité organisatrice de transport.',
          'Les horaires, les perturbations et les itinéraires proviennent de services tiers et peuvent être faux, en retard ou indisponibles. Vérifiez auprès de l’exploitant avant d’en dépendre pour ce qui compte.',
        ],
      },
      {
        title: 'Usage raisonnable',
        paragraphs: [
          'L’application sert à préparer vos propres déplacements. N’en extrayez pas les données en masse, n’automatisez pas de requêtes à travers elle, et ne rediffusez pas sous votre nom les données des exploitants.',
        ],
      },
    ],
    sources: [
      { label: 'Mobilités M, données ouvertes', url: 'https://data.mobilites-m.fr/' },
      { label: 'ATMO Auvergne-Rhône-Alpes', url: 'https://www.atmo-auvergnerhonealpes.fr/' },
      { label: 'Base Adresse Nationale', url: 'https://adresse.data.gouv.fr/' },
      { label: 'MapTiler', url: 'https://www.maptiler.com/copyright/' },
    ],
  };
};

const TABS = ['data', 'terms'] as const;
type Tab = (typeof TABS)[number];

const slideVariants = {
  enter: (direction: number) => ({ x: `${direction * 100}%`, opacity: 0.4 }),
  center: { x: '0%', opacity: 1 },
  exit: (direction: number) => ({ x: `${direction * -100}%`, opacity: 0.4 }),
};

export function LegalSheet({ isOpen, onClose, language, theme = 'dark', isMobile }: LegalSheetProps) {
  const isLight = theme === 'light';
  const isFr = language === 'fr';
  const content = getContent(language);
  const [tab, setTab] = useState<Tab>('data');
  const [direction, setDirection] = useState(1);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const changeTab = (next: Tab) => {
    if (next === tab) return;
    setDirection(TABS.indexOf(next) > TABS.indexOf(tab) ? 1 : -1);
    setTab(next);
    scrollerRef.current?.scrollTo({ top: 0 });
  };

  const ink = isLight ? '#000000' : '#ffffff';
  const soft = isLight ? '#525252' : '#a3a3a3';
  const faint = '#737373';
  const tint = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
  const surface = isLight ? '#ffffff' : '#0b0b0b';
  const Icon = tab === 'data' ? ShieldCheckIcon : DocumentTextIcon;

  const head = (
    <div className={`px-6 ${isMobile ? 'pt-4' : 'pt-7'}`}>
      <Icon className="h-12 w-12" style={{ color: ink }} aria-hidden="true" />
      <p role="heading" aria-level={2} className="pt-6 text-[1.625rem] font-medium leading-[1.15]" style={{ color: ink }}>
        {isFr ? 'Conditions et données' : 'Terms and data'}
      </p>

      <div className="mt-5 inline-flex gap-1 rounded-full p-1" style={{ backgroundColor: tint }}>
        {TABS.map((key, index) => (
          <button
            key={key}
            type="button"
            onClick={() => changeTab(key)}
            className="relative rounded-full px-4 py-2 text-[0.875rem] font-semibold transition-colors"
            style={{ color: tab === key ? (isLight ? '#ffffff' : '#000000') : soft }}
          >
            {tab === key && (
              <motion.span
                layoutId="legal-tab-pill"
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: ink }}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{content.tabs[index]}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const page = (key: Tab) => (
    <div className="px-6 pb-2">
      {(key === 'data' ? content.data : content.terms).map(section => (
        <section key={section.title} className="pt-7">
          <p className="text-[1.1875rem] font-medium leading-tight" style={{ color: ink }}>{section.title}</p>
          {section.paragraphs.map((paragraph, index) => (
            <p key={index} className="pt-2 text-[1rem] leading-snug" style={{ color: soft }}>
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      {key === 'data' && (
        <section className="pt-7">
          <p className="text-[1.1875rem] font-medium leading-tight" style={{ color: ink }}>
            {isFr ? 'Les sources' : 'Sources'}
          </p>
          <div className="mt-3 overflow-hidden rounded-2xl" style={{ backgroundColor: tint }}>
            {content.sources.map((source, index) => (
              <button
                key={source.url}
                type="button"
                onClick={() => openExternal(source.url)}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[0.9375rem] font-medium transition active:opacity-70"
                style={{
                  color: ink,
                  borderTop: index === 0 ? undefined : `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {source.label}
                <ArrowUpRightIcon className="h-4 w-4 flex-shrink-0" style={{ color: faint }} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  const pages = (
    <div className="relative overflow-x-hidden">
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.div
          key={tab}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'tween', duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
        >
          {page(tab)}
        </motion.div>
      </AnimatePresence>
    </div>
  );

  const foot = (
    <div className={`px-6 ${isMobile ? 'pt-6' : 'pb-6 pt-4'}`}>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-2xl py-4 text-[1.0625rem] font-semibold transition active:scale-[0.98]"
        style={isLight ? { backgroundColor: '#000000', color: '#ffffff' } : { backgroundColor: '#ffffff', color: '#000000' }}
      >
        {isFr ? 'Compris' : 'Got it'}
      </button>
      <p className="pt-3 text-center text-[0.8125rem]" style={{ color: faint }}>{content.updated}</p>
    </div>
  );

  if (isMobile) {
    return (
      <MapSheet isOpen={isOpen} onClose={onClose} isLight={isLight} zIndex={1000} initialSnap={3}>
        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {head}
          {pages}
          {foot}
          <MapSheetBottomSpacer />
        </div>
      </MapSheet>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="legal"
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
          onClick={onClose}
        >
          <motion.div
            className={`relative flex h-[min(85vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-3xl border shadow-2xl ${isLight ? 'border-slate-200' : 'border-white/10'}`}
            style={{ backgroundColor: surface }}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
            onClick={event => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex-shrink-0">{head}</div>
            <div
              ref={scrollerRef}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
              style={{ maskImage: 'linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)' }}
            >
              {pages}
            </div>
            <div className="flex-shrink-0">{foot}</div>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 rounded-full bg-black/30 p-1.5 text-white hover:bg-black/50"
              aria-label={isFr ? 'Fermer' : 'Close'}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
