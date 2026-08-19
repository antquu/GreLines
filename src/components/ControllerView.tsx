/**
 * La carte présentée au contrôleur.
 *
 * Ce n'est plus l'écran du voyageur : c'est celui qu'on tend à quelqu'un
 * d'autre, à bout de bras, souvent debout dans un tram qui bouge. Tout y est
 * donc au centre et en grand — le visage, le nom, le numéro — et rien n'y est
 * encadré : un contrôleur lit, il ne navigue pas.
 */

import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import type { OuraCard } from '../services/ouraCard';
import { cardStatusSentence } from '../utils/cardStatus';

interface ControllerViewProps {
  card: OuraCard | null;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  onClose: () => void;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function ControllerView({ card, language, theme = 'dark', onClose }: ControllerViewProps) {
  const isFr = language === 'fr';
  const statusSentence = card ? cardStatusSentence(card, language) : null;
  const isLight = theme === 'light';
  const isOpen = card !== null;

  /**
   * Le numéro, en code-barres à deux dimensions : un contrôleur le scanne au
   * lieu de le recopier. La bibliothèque n'est chargée qu'ici, à l'ouverture de
   * l'écran — elle ne pèse sur rien d'autre.
   */
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!card) return;
    let active = true;
    void import('qrcode')
      .then(module => module.toDataURL(card.cardCode, { margin: 1, width: 512 }))
      .then(url => { if (active) setQrUrl(url); })
      .catch(() => { if (active) setQrUrl(null); });
    return () => { active = false; };
  }, [card]);

  return (
    <div
      className={`fixed inset-0 z-[10005] flex flex-col transition-opacity duration-200 ${
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
      } ${isLight ? 'bg-white text-slate-900' : 'bg-slate-950 text-white'}`}
      aria-hidden={!isOpen}
    >
      <div className="flex items-center gap-2 px-3" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}>
        <button
          type="button"
          onClick={onClose}
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
            isLight ? 'text-slate-600' : 'text-slate-300'
          }`}
          aria-label={isFr ? 'Fermer' : 'Close'}
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
        <span className="text-base font-bold">
          {isFr ? 'Disposition contrôleur' : 'Inspector view'}
        </span>
      </div>

      {card && (
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 pb-8 pt-2 text-center"
          /* Carte coupée : tout passe en gris, et la mention se lit avant le
             reste. Un contrôleur doit voir en un regard que ce titre ne vaut
             plus, sans avoir à comparer des dates. */
          /* Coupée, la carte s'efface derrière son avertissement : le fond
             s'assombrit franchement, et c'est le message qui se lit. */
          style={statusSentence ? { filter: 'grayscale(1) brightness(0.35)' } : undefined}
        >

          {card.photoUrl && (
            <img
              src={card.photoUrl}
              alt=""
              className="h-52 w-40 flex-shrink-0 rounded-2xl object-cover shadow-2xl"
              draggable={false}
              // Un fichier disparu du bucket ne doit pas laisser une icône
              // d'image cassée au milieu d'un contrôle : mieux vaut pas de
              // photo qu'une photo manifestement en erreur.
              onError={event => { event.currentTarget.style.display = 'none'; }}
            />
          )}

          <div>
            <div className="text-3xl font-semibold uppercase leading-none">{card.firstName}</div>
            <div className="mt-1 text-3xl font-extrabold uppercase leading-none">{card.lastName}</div>
          </div>

          <div className="text-2xl font-bold tabular tracking-wide">{card.cardCode}</div>

          {/* La date de naissance : c'est elle qui justifie un tarif jeune. */}
          {card.birthDate && (
            <div className="text-base font-semibold">
              {isFr ? 'Né(e) le' : 'Born on'} {formatDate(card.birthDate)}
            </div>
          )}

          {card.contractLabel && (
            <div className="text-base font-semibold text-slate-400">{card.contractLabel}</div>
          )}

          <div className="text-sm text-slate-400">
            {formatDate(card.contractStartingAt)} → {formatDate(card.contractEndingAt)}
          </div>

          {/* Le code se lit sur fond blanc, quel que soit le thème : un lecteur
              a besoin du contraste, pas de notre palette. */}
          {qrUrl && (
            <img
              src={qrUrl}
              alt={isFr ? 'Numéro de carte en code QR' : 'Card number as a QR code'}
              className="h-44 w-44 rounded-2xl bg-white p-2 shadow-xl"
              draggable={false}
            />
          )}
        </div>
      )}

      {/* Au milieu, par-dessus tout : c'est la seule chose qu'un contrôleur ait
          besoin de lire quand la carte ne vaut plus. */}
      {card && statusSentence && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          {/* Un cadre plein derrière le texte : posé à même le contenu assombri,
              il se lisait mal. Le titre en blanc, la raison en gris — c'est le
              titre qu'on lit à un mètre, la raison qu'on lit de près. */}
          <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-slate-950/95 px-6 py-7 text-center shadow-2xl">
            <p className="text-3xl font-extrabold text-white">
              {isFr ? 'Carte désactivée' : 'Card disabled'}
            </p>
            {/* Pas de code d'incident ici : un contrôleur a besoin de savoir
                que la carte ne vaut plus, pas de le rapporter à un guichet. Le
                code reste sur l'écran du porteur, à qui il servira. */}
            <p className="mt-3 text-base font-medium leading-snug text-slate-400">{statusSentence}</p>
          </div>
        </div>
      )}
    </div>
  );
}
