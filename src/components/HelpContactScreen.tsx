import {
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  PhoneIcon,
} from '@heroicons/react/24/solid';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { MinimalScreen } from './MinimalScreen';
import { openExternal } from '../utils/openExternal';
import { getCurrentCity, subscribeCurrentCity } from '../utils/currentArea';

interface NetworkContact {
  name: string;
  url: string | null;
  phone: string | null;
}

let contactsPromise: Promise<Record<string, NetworkContact[]>> | null = null;
function loadNetworkContacts(): Promise<Record<string, NetworkContact[]>> {
  contactsPromise ??= fetch('/data/networks/index.json')
    .then(response => (response.ok ? response.json() : {}))
    .then((index: Record<string, { contacts?: NetworkContact[] }>) =>
      Object.fromEntries(Object.entries(index).map(([code, entry]) => [code, entry.contacts ?? []])))
    .catch(() => ({}));
  return contactsPromise;
}

function phoneForDisplay(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '').replace(/^\+33(0)?/, '0').replace(/^0033/, '0');
  return /^0\d{9}$/.test(digits) ? digits.replace(/(\d{2})(?=\d)/g, '$1 ') : raw;
}
function phoneForDialing(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '').replace(/^\+33\(?0\)?/, '+33');
  return /^0\d{9}$/.test(digits) ? `+33${digits.slice(1)}` : digits;
}
const hostOf = (url: string) => {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
};

function handOff(target: string): void {
  const link = document.createElement('a');
  link.href = target;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

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
  const city = useSyncExternalStore(subscribeCurrentCity, getCurrentCity, () => null);
  const networkCode = city?.network ?? null;
  const [contacts, setContacts] = useState<Record<string, NetworkContact[]> | null>(null);
  useEffect(() => {
    if (!networkCode || !isOpen) return;
    let active = true;
    void loadNetworkContacts().then(value => { if (active) setContacts(value); });
    return () => { active = false; };
  }, [networkCode, isOpen]);
  const networkContacts = networkCode ? contacts?.[networkCode] ?? [] : [];

  const surface = isLight ? 'bg-white border-slate-200' : 'bg-black border-slate-900';
  const ink = isLight ? 'text-slate-900' : 'text-white';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  const heading = (label: string) => (
    <h3 className={`mb-3 mt-8 px-1 text-[1.1875rem] font-bold leading-tight ${ink}`}>{label}</h3>
  );

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
        <span className={`block text-[0.9375rem] font-semibold ${ink}`}>{label}</span>
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

        {networkCode ? (
          <>
            {networkContacts.length > 0 ? (
              <div className="space-y-2">
                {networkContacts.map(contact => (
                  <div key={contact.name} className="space-y-2">
                    {contact.phone && row(
                      isFr ? `Appeler ${contact.name}` : `Call ${contact.name}`,
                      PhoneIcon,
                      () => handOff(`tel:${phoneForDialing(contact.phone!)}`),
                      phoneForDisplay(contact.phone),
                    )}
                    {contact.url && row(
                      isFr ? `Site de ${contact.name}` : `${contact.name} website`,
                      ArrowTopRightOnSquareIcon,
                      () => openExternal(contact.url!),
                      isFr
                        ? `${hostOf(contact.url)} · contact, réclamations, objets trouvés`
                        : `${hostOf(contact.url)} · contact, complaints, lost property`,
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className={`rounded-2xl border px-4 py-4 text-sm leading-relaxed ${surface} ${muted}`}>
                {contacts === null
                  ? (isFr ? 'Chargement des coordonnées du réseau…' : 'Loading the network’s contact details…')
                  : (isFr
                    ? 'Ce réseau ne publie pas ses coordonnées dans ses données ouvertes. Cherchez son site officiel.'
                    : 'This network does not publish its contact details in its open data. Look up its official website.')}
              </p>
            )}
          </>
        ) : (
          <>
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
          </>
        )}

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
