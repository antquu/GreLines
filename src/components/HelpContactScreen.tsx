/**
 * Aide et contact.
 *
 * Une page d'aiguillage, et rien d'autre : GreLines ne prend pas de
 * signalement, ne garde pas d'objet trouvé et ne répond pas au téléphone. Ce
 * qu'elle peut faire, c'est mener au bon endroit sans faire chercher — et le
 * faire vite, parce qu'on ouvre cette page quand quelque chose ne va pas.
 *
 * L'ordre suit l'urgence. Ce qui touche à la sécurité d'abord, avec le numéro
 * qu'on compose sans réfléchir ; les objets perdus ensuite ; l'application
 * elle-même en dernier — un bug d'affichage attendra.
 *
 * Les coordonnées sont celles du réseau, relevées sur ses pages officielles :
 * Allo TAG au 04 38 70 38 70 (du lundi au samedi, 8 h – 18 h 30), les objets
 * trouvés sur tag.franceobjetstrouves.fr, et le formulaire de M réso. Elles
 * sont écrites en clair ici, et nulle part ailleurs : si le réseau en change,
 * c'est ce fichier qu'on modifie.
 */

import {
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  PhoneIcon,
} from '@heroicons/react/24/solid';
import { MinimalScreen } from './MinimalScreen';
import { openExternal } from '../utils/openExternal';

/**
 * Composer un numéro, écrire un courriel.
 *
 * Un lien synthétique plutôt que `window.location` : le système reprend la
 * main — l'application ne navigue pas, elle passe le relais au téléphone ou au
 * client de messagerie, et l'on revient sur la page qu'on avait sous les yeux.
 */
function handOff(target: string): void {
  const link = document.createElement('a');
  link.href = target;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Le numéro du réseau, tel qu'on le compose. */
const ALLO_TAG_TEL = '+33438703870';
const ALLO_TAG_LABEL = '04 38 70 38 70';
const LOST_PROPERTY_URL = 'https://tag.franceobjetstrouves.fr';
const NETWORK_CONTACT_URL = 'https://www.reso-m.fr/549-contacter-allotag-par-mail.htm';
const APP_CONTACT_MAIL = 'ant.adam468@gmail.com';

export function HelpContactScreen({
  isOpen,
  language,
  isLight,
  onBack,
}: {
  isOpen: boolean;
  language: 'fr' | 'en';
  isLight: boolean;
  onBack: () => void;
}) {
  const isFr = language === 'fr';

  const surface = isLight ? 'bg-white border-slate-200' : 'bg-black border-slate-900';
  const ink = isLight ? 'text-slate-900' : 'text-white';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  /** Un titre de section : ce dont on parle, en clair. */
  const heading = (label: string) => (
    <h3 className={`mb-3 mt-8 px-1 text-[19px] font-bold leading-tight ${ink}`}>{label}</h3>
  );

  /** Une rangée : ce qu'elle fait à gauche, où elle mène à droite. */
  const row = (
    label: string,
    Icon: typeof PhoneIcon,
    onSelect: () => void,
    detail?: string,
  ) => (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${surface}`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-semibold ${ink}`}>{label}</span>
        {detail && <span className={`mt-0.5 block text-xs ${muted}`}>{detail}</span>}
      </span>
      <Icon className={`h-5 w-5 flex-shrink-0 ${muted}`} />
    </button>
  );

  return (
    <MinimalScreen
      isOpen={isOpen}
      title={isFr ? 'Aide et contact' : 'Help and contact'}
      isLight={isLight}
      onBack={onBack}
    >
      <div className="px-4 pb-10">
        {heading(isFr ? 'Signaler un incident ou un comportement' : 'Report an incident or behaviour')}
        {/*
          Le 112 avant tout le reste, et écrit assez gros pour être lu de
          travers. Une page d'aide ouverte dans un tram à onze heures du soir
          n'a qu'une chose à dire d'abord, et ce n'est pas un numéro de service
          client.
        */}
        <div
          className={`mb-3 flex items-start gap-3 rounded-2xl border px-4 py-4 ${
            isLight ? 'border-rose-200 bg-rose-50' : 'border-rose-500/30 bg-rose-950/40'
          }`}
        >
          <ExclamationTriangleIcon
            className={`mt-0.5 h-5 w-5 flex-shrink-0 ${isLight ? 'text-rose-600' : 'text-rose-400'}`}
          />
          <p className={`text-sm leading-relaxed ${isLight ? 'text-rose-900' : 'text-rose-100'}`}>
            {isFr
              ? 'En cas d’urgence, appelez le 112. C’est le numéro européen : il répond depuis n’importe quel téléphone, même sans forfait et même verrouillé.'
              : 'In an emergency, call 112. It is the European number: it answers from any phone, even without a plan and even locked.'}
          </p>
        </div>

        <div className="space-y-2">
          {row(
            isFr ? 'Appeler Allo TAG' : 'Call Allo TAG',
            PhoneIcon,
            () => handOff(`tel:${ALLO_TAG_TEL}`),
            isFr
              ? `${ALLO_TAG_LABEL} · du lundi au samedi, 8 h – 18 h 30`
              : `${ALLO_TAG_LABEL} · Monday to Saturday, 8 am – 6.30 pm`,
          )}
          {row(
            isFr ? 'Écrire au réseau' : 'Write to the network',
            ArrowTopRightOnSquareIcon,
            () => openExternal(NETWORK_CONTACT_URL),
            isFr
              ? 'Formulaire de M réso : incident, réclamation, question sur un titre.'
              : 'M réso form: incidents, complaints, questions about a ticket.',
          )}
        </div>

        {heading(isFr ? 'Objets trouvés' : 'Lost property')}
        <div className="space-y-2">
          {row(
            isFr ? 'Déclarer ou retrouver un objet' : 'Report or find an item',
            ArrowTopRightOnSquareIcon,
            () => openExternal(LOST_PROPERTY_URL),
            isFr
              ? 'Ce qui est oublié dans un tram ou un bus part chez France Objets Trouvés.'
              : 'Anything left on a tram or bus goes to France Objets Trouvés.',
          )}
        </div>

        {heading(isFr ? 'L’application' : 'The app')}
        <div className="space-y-2">
          {row(
            isFr ? 'Signaler un problème dans GreLines' : 'Report a problem in GreLines',
            ChatBubbleLeftRightIcon,
            () => handOff(`mailto:${APP_CONTACT_MAIL}`),
            APP_CONTACT_MAIL,
          )}
        </div>
      </div>
    </MinimalScreen>
  );
}
