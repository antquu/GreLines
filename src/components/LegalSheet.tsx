/**
 * Les conditions, et ce qu'on fait des données.
 *
 * Un écran de conditions n'est lu que par ceux qui le cherchent, et ceux-là le
 * cherchent pour une raison précise : savoir ce qui part de leur téléphone. Le
 * texte est donc écrit pour être compris — des phrases, pas des articles
 * numérotés —, et il commence par ce qui inquiète plutôt que par ce qui
 * protège.
 *
 * Deux sections seulement : ce que l'application fait de vos données, et ce
 * qu'elle vous doit. La seconde est courte : elle est gratuite et sans compte,
 * l'essentiel s'y résume à ne rien promettre qu'on ne tienne.
 */

import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { MapSheet } from './MapSheet';
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
            'Requests for timetables, routes, disruptions and air quality go to the transport operators’ own APIs. They see the request — a stop, two coordinates — as any browser visiting their service would.',
            'Map tiles are served by MapTiler, addresses by the French national address base. Anonymous audience measurement is provided by Vercel, without cookies.',
            'Your location, when you allow it, never leaves the device: it is used to draw the map and sort nearby stops.',
          ],
        },
        {
          title: 'Transport cards',
          paragraphs: [
            'A card added to the wallet is the only case where something is stored on a server. The number, the holder’s name and photo are kept in our database, attached to a random device identifier — not to you.',
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
        { label: 'Mobilités M — open data', url: 'https://data.mobilites-m.fr/' },
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
          'Les demandes d’horaires, d’itinéraires, de perturbations et de qualité de l’air partent vers les interfaces des exploitants eux-mêmes. Ils voient la requête — un arrêt, deux coordonnées — comme n’importe quel navigateur consultant leur service.',
          'Le fond de carte est servi par MapTiler, les adresses par la Base Adresse Nationale. La mesure d’audience, anonyme et sans cookie, est assurée par Vercel.',
          'Votre position, quand vous l’autorisez, ne quitte jamais l’appareil : elle sert à centrer la carte et à trier les arrêts autour de vous.',
        ],
      },
      {
        title: 'Les cartes de transport',
        paragraphs: [
          'Une carte ajoutée au portefeuille est le seul cas où quelque chose est conservé sur un serveur. Le numéro, le nom du porteur et sa photo sont gardés dans notre base, rattachés à un identifiant d’appareil tiré au sort — pas à vous.',
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
      { label: 'Mobilités M — données ouvertes', url: 'https://data.mobilites-m.fr/' },
      { label: 'ATMO Auvergne-Rhône-Alpes', url: 'https://www.atmo-auvergnerhonealpes.fr/' },
      { label: 'Base Adresse Nationale', url: 'https://adresse.data.gouv.fr/' },
      { label: 'MapTiler', url: 'https://www.maptiler.com/copyright/' },
    ],
  };
};

export function LegalSheet({ isOpen, onClose, language, theme = 'dark', isMobile }: LegalSheetProps) {
  const isLight = theme === 'light';
  const content = getContent(language);
  const [tab, setTab] = useState<'data' | 'terms'>('data');

  const sections = tab === 'data' ? content.data : content.terms;
  const strong = isLight ? 'text-slate-900' : 'text-white';
  const muted = isLight ? 'text-slate-600' : 'text-slate-400';

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
      {/* Deux onglets, pas deux écrans : les conditions et le sort des données
          se lisent d'affilée, et l'on passe de l'un à l'autre sans se demander
          où l'on était. */}
      <div
        className={`mb-5 inline-flex gap-1 rounded-2xl p-1 ${
          isLight ? 'bg-slate-200/70' : 'bg-white/5'
        }`}
      >
        {(['data', 'terms'] as const).map((key, index) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              tab === key
                ? 'bg-blue-600 text-white'
                : isLight
                ? 'text-slate-600'
                : 'text-slate-400'
            }`}
          >
            {content.tabs[index]}
          </button>
        ))}
      </div>

      {sections.map(section => (
        <section key={section.title} className="mb-7">
          <h3 className={`mb-2 text-[17px] font-bold leading-tight ${strong}`}>{section.title}</h3>
          {section.paragraphs.map((paragraph, index) => (
            <p key={index} className={`mb-2 text-[0.95rem] leading-relaxed ${muted}`}>
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      {tab === 'data' && (
        <section className="mb-7">
          <h3 className={`mb-3 text-[17px] font-bold leading-tight ${strong}`}>
            {language === 'fr' ? 'Les sources' : 'Sources'}
          </h3>
          <div className="space-y-2">
            {content.sources.map(source => (
              <button
                key={source.url}
                type="button"
                onClick={() => openExternal(source.url)}
                className={`flex w-full items-center rounded-2xl px-4 py-3 text-left text-sm font-semibold transition active:scale-[0.99] ${
                  isLight ? 'bg-blue-500/10 text-blue-700' : 'bg-blue-500/15 text-blue-300'
                }`}
              >
                {source.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <p className={`text-xs ${muted}`}>{content.updated}</p>
    </div>
  );

  const header = (
    <div className="flex flex-shrink-0 items-center justify-between px-5 pb-2 pt-1">
      <h2 className={`text-[22px] font-extrabold leading-none ${strong}`}>
        {language === 'fr' ? 'Conditions et données' : 'Terms and data'}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label={language === 'fr' ? 'Fermer' : 'Close'}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90 ${
          isLight ? 'bg-slate-200/70 text-slate-700' : 'bg-white/10 text-white'
        }`}
      >
        <XMarkIcon className="h-5 w-5" />
      </button>
    </div>
  );

  // Téléphone : une feuille comme les autres. Ordinateur : une fenêtre posée au
  // centre — une feuille pleine hauteur sur un grand écran n'aurait pas de sens.
  if (isMobile) {
    return (
      <MapSheet isOpen={isOpen} onClose={onClose} isLight={isLight} zIndex={200} initialSnap={3}>
        {header}
        {body}
      </MapSheet>
    );
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-[10001] bg-black/60 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`fixed left-1/2 top-1/2 z-[10002] flex max-h-[80vh] w-[min(38rem,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border pt-4 shadow-2xl transition-all duration-200 ${
          isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        } ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`}
        style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
        aria-hidden={!isOpen}
      >
        {header}
        {body}
      </div>
    </>
  );
}
