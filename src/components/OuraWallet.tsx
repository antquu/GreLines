/**
 * Le portefeuille de cartes.
 *
 * Les cartes s'empilent comme dans une poche : on ne voit que la dernière en
 * entier, les autres dépassent d'un centimètre. En toucher une la fait monter
 * seule et grandir d'un rien, pendant que tout le reste de l'écran s'efface —
 * les réglages descendent, la barre d'onglets quitte le bas. Il ne reste que la
 * carte, ce qu'elle porte écrit dessous, et de quoi la retirer ou la présenter
 * à un contrôleur.
 *
 * Sans carte, l'empilement laisse place au carton générique barré d'une croix :
 * il montre ce qu'on n'a pas encore, et invite à l'ajouter.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowsRightLeftIcon, CameraIcon, ChevronRightIcon, EllipsisVerticalIcon, PencilSquareIcon, IdentificationIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { OuraCardFace } from './OuraCardFace';
import { ControllerView } from './ControllerView';
import { NotificationDetail } from './NotificationDetail';
import { GreenerBanner } from './GreenerBanner';
import { formatNotificationDay } from '../utils/notificationDay';
import { scanCard, toCanvas } from '../services/cardOcr';
import { cardStatusCode, cardStatusLabel, cardStatusSentence } from '../utils/cardStatus';
import {
  deleteOuraCard,
  findKnownCard,
  listNotifications,
  listOuraCards,
  lookupOuraCard,
  transferCard,
  type OuraCard,
  type OuraNotification,
} from '../services/ouraCard';

interface OuraWalletProps {
  cards: OuraCard[];
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  onAddCard: () => void;
  onCardsChange: (cards: OuraCard[]) => void;
  /** Prévient l'écran qu'une carte occupe le devant : tout le reste s'efface. */
  onFocusChange?: (focused: boolean) => void;
  /** Vrai quand la base n'est pas configurée : rien ne peut être enregistré. */
  disabled?: boolean;
  /**
   * Où la carte dépliée a le droit de s'étendre.
   *
   * `screen` : elle prend l'écran, comme sur téléphone où le portefeuille *est*
   * l'écran. `panel` : elle reste dans le cadre qui la contient — le carré du
   * bureau — et s'y déplie à la même échelle relative.
   *
   * Tout le dessin est le même ; seules changent les unités dans lesquelles il
   * se mesure. À l'écran on compte en `vw`/`vh` ; dans un panneau, en `cqw`/`cqh`,
   * qui rapportent au conteneur au lieu de la fenêtre.
   */
  variant?: 'screen' | 'panel';
}

/** Décalage vertical entre deux cartes de la pile, en pixels. */
const STACK_OFFSET = 34;

/**
 * Ce qu'on laisse voir d'une carte rangée en bas de l'écran.
 *
 * Assez pour reconnaître son porteur — le nom sort de la tranche — et pour la
 * viser du pouce sans hésiter, pas assez pour disputer la vedette à celle qu'on
 * regarde.
 */
const PEEK_HEIGHT = 54;

/**
 * Ce que chaque carte supplémentaire ajoute à la pile du bas.
 *
 * Bien moins que la première : la deuxième carte rangée n'a pas besoin de se
 * montrer autant que celle du dessus, il suffit qu'on devine sa tranche. Sans
 * cela, trois cartes ou plus feraient monter la pile jusqu'au milieu de
 * l'écran et mangeraient l'identité.
 */
const STACK_STEP = 16;

/** Hauteur occupée en bas par `count` cartes rangées. */
function stackHeight(count: number): number {
  return count > 0 ? PEEK_HEIGHT + (count - 1) * STACK_STEP : 0;
}

/**
 * Hauteur à laquelle se pose la carte mise en avant.
 *
 * Au ras de la zone sûre : ce qui compte est sous elle — l'identité, puis les
 * messages —, et chaque pixel gagné en haut est un message de plus qu'on lit
 * sans faire défiler.
 */
const FRONT_TOP = 0;

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Une carte vaut tant qu'elle n'est ni périmée ni sur liste noire. */
function isCardValid(card: OuraCard): boolean {
  if (card.isDisabled) return false;
  if (card.isBlacklisted) return false;
  if (card.isExpired) return false;
  const end = card.contractEndingAt ?? card.expiresAt;
  if (end && new Date(end).getTime() < Date.now()) return false;
  return true;
}

export function OuraWallet({
  cards,
  language,
  theme = 'dark',
  onAddCard,
  onCardsChange,
  onFocusChange,
  disabled,
  variant = 'screen',
}: OuraWalletProps) {
  const isPanel = variant === 'panel';
  /** L'unité dans laquelle la couche dépliée se mesure. */
  const VH = isPanel ? '100cqh' : '100vh';
  /** Dans un panneau il n'y a pas d'encoche : la marge haute vaut zéro. */
  const SAFE_TOP = isPanel ? '0px' : 'env(safe-area-inset-top, 0px)';
  /*
   * Le carré du bureau fait 384 px de haut ; un téléphone en fait le double.
   * La carte y occupe donc la moitié de la place au lieu du quart, et ce qui se
   * lit dessous — l'identité, l'état, les messages — n'a plus la hauteur d'un
   * titre de 32 px. On resserre la carte sur ses côtés et l'on descend d'un cran
   * chaque taille de texte : c'est le même dessin, à une autre échelle.
   */
  const CARD_INSET = isPanel ? 'inset-x-6' : 'inset-x-4';
  const titleSize = isPanel ? 'text-[24px]' : 'text-[32px]';
  const nameSize = isPanel ? 'text-[18px]' : 'text-[24px]';
  const bodySize = isPanel ? 'text-[14px]' : 'text-base';
  const metaSize = isPanel ? 'text-[13px]' : 'text-sm';
  const noticeSize = isPanel ? 'text-[17px]' : 'text-[22px]';
  const isFr = language === 'fr';
  const isLight = theme === 'light';
  /*
   * L'ombre des cartes suit le thème.
   *
   * `shadow-2xl` est calculée pour un fond sombre : posée sur du blanc, elle
   * dessine un liseré gris autour de la carte, qu'on prend pour une bordure. En
   * clair on veut une ombre portée douce, qui décolle la carte sans la cerner.
   *
   * Elle est remise à `OuraCardFace`, qui la pose sur les bords du carton :
   * étalée sur le gabarit, elle cernait la marge transparente qui l'entoure.
   */
  const cardShadow = isLight
    ? 'shadow-[0_10px_28px_rgba(15,23,42,0.10)]'
    : 'shadow-2xl';

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [controllerCard, setControllerCard] = useState<OuraCard | null>(null);
  /** Les messages de la carte regardée, chargés à sa mise en avant. */
  const [notifications, setNotifications] = useState<OuraNotification[]>([]);
  const [openNotification, setOpenNotification] = useState<OuraNotification | null>(null);
  /**
   * La descente des cartes rangées.
   *
   * Même remarque que pour le grossissement, mais pour les autres cartes : si
   * la couche les pose d'emblée en bas de l'écran, on ne les voit jamais y
   * aller. Elles naissent donc là où la pile fermée les montrait — sous la
   * carte de devant, décalées d'un cran — puis glissent vers le bas.
   *
   * Distinct de `lifted`, qui se rejoue à chaque échange de carte : la descente
   * n'appartient qu'à l'ouverture. Échanger deux cartes doit rester ce qu'il
   * est — l'une monte, l'autre descend —, pas un dépilement recommencé.
   */
  const [entered, setEntered] = useState(false);
  /**
   * Transfert vers un nouveau support. Une carte se périme ou se perd ; le
   * porteur, lui, ne change pas — il n'y a donc rien à ressaisir, juste un
   * numéro à donner.
   */
  const [transferFrom, setTransferFrom] = useState<OuraCard | null>(null);
  const [transferCode, setTransferCode] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  /** Comment on donne le nouveau numéro : en le photographiant, ou en le tapant. */
  const [transferStep, setTransferStep] = useState<'choice' | 'scan' | 'manual'>('choice');
  const transferVideoRef = useRef<HTMLVideoElement | null>(null);
  const transferStreamRef = useRef<MediaStream | null>(null);

  const stopTransferCamera = () => {
    transferStreamRef.current?.getTracks().forEach(track => track.stop());
    transferStreamRef.current = null;
  };

  useEffect(() => {
    if (transferStep !== 'scan' || !transferFrom) {
      stopTransferCamera();
      return;
    }
    let cancelled = false;
    void navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        transferStreamRef.current = stream;
        if (transferVideoRef.current) {
          transferVideoRef.current.srcObject = stream;
          void transferVideoRef.current.play();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTransferError(text.transferCamera);
          setTransferStep('manual');
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferStep, transferFrom]);

  const text = {
    empty: isFr ? 'Carte OURA non-configurée.' : 'No OURA card set up.',
    add: isFr ? 'Ajouter une carte' : 'Add a card',
    unavailable: isFr ? 'Indisponible hors ligne.' : 'Unavailable offline.',
    remove: isFr ? 'Supprimer la carte' : 'Remove the card',
    transfer: isFr ? 'Transférer vers une nouvelle carte' : 'Transfer to a new card',
    transferHint: isFr
      ? 'Numéro de la nouvelle carte'
      : 'New card number',
    transferDo: isFr ? 'Transférer' : 'Transfer',
    transferFailed: isFr ? 'Ce numéro est introuvable.' : 'This number was not found.',
    transferBusy: isFr ? 'Transfert…' : 'Transferring…',
    transferScan: isFr ? 'Scanner la nouvelle carte' : 'Scan the new card',
    transferManual: isFr ? 'Saisir le numéro' : 'Enter the number',
    transferReading: isFr ? 'Lecture de la carte…' : 'Reading the card…',
    transferCamera: isFr
      ? "L'appareil photo n'est pas accessible."
      : 'The camera is unavailable.',
    transferExplain: isFr
      ? 'Votre nom et votre photo seront reportés sur le nouveau support. L’ancien quittera cet appareil.'
      : 'Your name and photo move to the new card. The old one leaves this device.',
    controller: isFr ? 'Contrôleur' : 'Inspector',
    more: isFr ? 'Autres actions' : 'More actions',
    close: isFr ? 'Replier' : 'Collapse',
    born: isFr ? 'Né(e) le' : 'Born on',
    disabled: isFr ? 'Carte désactivée' : 'Card disabled',
    removeFromWallet: isFr ? 'Supprimer la carte' : 'Remove the card',

    notifications: isFr ? 'Dernières notifications' : 'Latest notifications',
  };

  /**
   * Une carte retirée ne doit pas laisser la pile ouverte sur un vide : on
   * corrige à la lecture plutôt que dans un effet, qui demanderait un second
   * rendu pour dire ce que celui-ci sait déjà.
   */
  const safeIndex = openIndex !== null && openIndex < cards.length ? openIndex : null;
  const focusedCode = safeIndex !== null ? cards[safeIndex].cardCode : null;
  /* Les messages chargés valent pour la carte demandée, et pour elle seule :
     tant que la réponse n'est pas là, la liste précédente ne s'affiche pas. */
  const shownNotifications = focusedCode ? notifications : [];

  useEffect(() => {
    if (safeIndex === null) return;
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [safeIndex]);

  useEffect(() => {
    if (!focusedCode) return;
    let active = true;
    void listNotifications(focusedCode).then(list => {
      if (active) setNotifications(list);
    });
    return () => { active = false; };
  }, [focusedCode]);

  /**
   * La colonne repart du haut a chaque carte.
   *
   * Elle etait remontee a neuf pour cela, ce qui coutait l'animation d'echange :
   * une colonne qui se demonte emporte la carte qui s'en va, et l'on ne voit
   * plus que la nouvelle apparaitre. On la garde donc en place et l'on remet
   * simplement son defilement a zero. Sans quoi, passer d'une carte lue jusqu'en
   * bas a une autre laisserait l'ecran au milieu de messages qui ne sont plus
   * les memes.
   */
  const columnRef = useRef<HTMLDivElement | null>(null);
  /**
   * La colonne repart du haut à chaque carte.
   *
   * Sans cela, passer d'une carte lue jusqu'en bas à une autre laisserait
   * l'écran au milieu de messages qui ne sont plus les mêmes.
   */
  useEffect(() => {
    columnRef.current?.scrollTo({ top: 0 });
  }, [focusedCode]);

  const focus = (index: number | null) => {
    if (index === null) setEntered(false);
    setOpenIndex(index);
    setIsMenuOpen(false);
    onFocusChange?.(index !== null);
  };

  if (cards.length === 0) {
    return (
      <div className="relative">
        <OuraCardFace forceFront className="opacity-40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <XMarkIcon className="h-12 w-12 text-white drop-shadow" />
          <p className="px-6 text-center text-sm font-semibold text-white drop-shadow">
            {disabled ? text.unavailable : text.empty}
          </p>
          {!disabled && (
            <button
              type="button"
              onClick={onAddCard}
              className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg transition active:scale-95"
            >
              <PlusIcon className="h-4 w-4" />
              {text.add}
            </button>
          )}
        </div>
      </div>
    );
  }

  const opened = safeIndex !== null ? cards[safeIndex] : null;
  const others = safeIndex === null ? [] : cards.filter((_, index) => index !== safeIndex);
  /** Ce qui est arrivé à la carte, s'il lui est arrivé quelque chose. */
  const statusSentence = opened ? cardStatusSentence(opened, language) : null;

  /*
   * Ce qui se lit sous la carte : l'identite du porteur ou l'etat de la
   * carte, puis les messages recus. Le meme contenu sert aux deux mises en
   * page — celle de l'ecran, ou il se pose sous une carte fixe, et celle du
   * panneau, ou il defile avec elle.
   *
   * Une variable et non un composant : declaree dans le corps, une fonction
   * changerait d'identite a chaque rendu et React remonterait tout le bloc.
   */
  const detailContent = opened ? (
    <>
          {/* Sous la carte, l'identité — ou, si la carte est coupée, le
              fait qu'elle l'est. Le carton, lui, garde son porteur : c'est
              la pièce, elle ne change pas parce qu'on l'a suspendue. */}
          {statusSentence ? (
            /* Une phrase d'état peut être longue — celle du réseau l'est
               souvent. Dans le panneau elle défile plutôt que de passer
               sous la pile. */
            <div className="contents">
              {/* « Carte désactivée » prend la place du prénom : c'est ce
                  qu'on vient lire, et rien ne doit passer avant. */}
              <div className={`${titleSize} font-semibold leading-none ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {text.disabled}
              </div>
              <div className={`mt-3 ${bodySize} leading-snug text-slate-500`}>{statusSentence}</div>
              {/* Le code de l'incident, à recopier au guichet : discret,
                  mais toujours là quand on en a besoin. */}
              {cardStatusCode(opened) && (
                <div className={`mt-2 ${metaSize} tabular text-slate-500`}>{cardStatusCode(opened)}</div>
              )}
            </div>
          ) : (
            <>
              <div className={`${titleSize} font-semibold leading-none ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {opened.firstName}
              </div>
              <div className={`mt-1 ${nameSize} font-bold leading-none ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {opened.lastName}
              </div>
              <div className={`mt-3 ${metaSize} tabular text-slate-500`}>{opened.cardCode}</div>
              {opened.birthDate && (
                <div className={`mt-1 ${metaSize} text-slate-500`}>
                  {text.born} {formatDate(opened.birthDate)}
                </div>
              )}
              {opened.contractLabel && (
                <div className={`mt-1 ${metaSize} text-slate-500`}>{opened.contractLabel}</div>
              )}
            </>
          )}
  
          {/* Le remerciement, au-dessus des messages : c'est la seule ligne du
              portefeuille qui ne demande rien. Il se ferme une fois pour
              toutes. */}
          <div className={isPanel ? 'mt-5' : 'mt-8'}>
            <GreenerBanner language={language} />
          </div>

          {/* Ce qu'on a reçu à propos de cette carte.
  
              Sans message, rien ne s'affiche — ni titre, ni encart vide :
              une carte qui n'a rien reçu n'a rien à dire. */}
          {shownNotifications.length > 0 && !statusSentence && (
          <>
          <h3
            className={`${isPanel ? 'mt-5' : 'mt-8'} ${noticeSize} font-bold leading-none ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            {text.notifications}
          </h3>
  
          <div
            /* La liste se laisse porter par la colonne, qui défile déjà. Elle
               a eu sa propre zone de défilement sur téléphone, du temps où la
               carte restait fixe au-dessus : deux zones emboîtées se
               disputaient le geste, et l'on ne savait jamais laquelle on
               poussait. */
            className="pointer-events-auto mt-3 pb-2"
          >
            <div
              className={`overflow-hidden rounded-2xl ${
                isLight ? 'bg-slate-200/60' : 'bg-white/5'
              }`}
            >
                {shownNotifications.map((notification, index) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => setOpenNotification(notification)}
                    className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition active:bg-white/5 ${
                      index > 0 ? (isLight ? 'border-t border-slate-300/60' : 'border-t border-white/5') : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[0.95rem] font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {notification.title}
                      </span>
                      {notification.body && (
                        <span className="mt-0.5 block line-clamp-2 text-sm text-slate-500">
                          {notification.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-sm capitalize text-slate-500">
                        {formatNotificationDay(notification.createdAt, language)}
                      </span>
                    </span>
                    <ChevronRightIcon className="mt-1 h-4 w-4 flex-shrink-0 text-slate-500" />
                  </button>
                ))}
            </div>
          </div>
          </>
          )}
    </>
  ) : null;

  return (
    <div>
      {safeIndex === null ? (
        /* La pile. Chaque carte est décalée de la précédente ; la hauteur du
           bloc suit le nombre de cartes pour que rien ne déborde. */
        <div className="relative" style={{ paddingBottom: (cards.length - 1) * STACK_OFFSET }}>
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              onClick={() => focus(index)}
              className="absolute left-0 right-0 block w-full text-left transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99]"
              style={{ top: index * STACK_OFFSET, zIndex: index }}
            >
              <OuraCardFace
                firstName={card.firstName}
                lastName={card.lastName}
                cardCode={card.cardCode}
                expiresAt={card.expiresAt}
                photoUrl={card.photoUrl}
                valid={isCardValid(card)}
                disabled={card.isDisabled}
                statusLabel={cardStatusLabel(card, language)}
                shadowClassName={cardShadow}
              />
            </button>
          ))}
          <div className="invisible">
            <OuraCardFace forceFront />
          </div>
        </div>
      ) : (
        /*
         * Toutes les cartes vivent dans une même couche pendant qu'on en
         * regarde une : celle du devant en haut, les autres empilées en bas.
         * Elles partagent donc un seul repère, et changer de carte ne fait que
         * déplacer deux positions — le navigateur anime le reste. On voit la
         * carte du haut descendre et celle du bas monter, au lieu de les voir
         * se substituer d'un coup.
         *
         * La couche est fixée à l'écran, ce que la page permet : elle ne défile
         * plus tant qu'une carte est en avant.
         */
        <div
          /* Dans un panneau la couche s'arrête au cadre : `fixed` la ferait
             s'échapper sur toute la page, et une carte de transport en plein
             écran par-dessus la carte routière n'est pas ce qu'on a demandé en
             cliquant une vignette de trois centimètres. Le `containerType`
             donne leur référence aux unités `cqw`/`cqh`. */
          className={`${isPanel ? 'absolute' : 'fixed'} inset-0 z-[6]`}
          style={{ pointerEvents: 'none', containerType: isPanel ? 'size' : undefined }}
        >
          {/*
            Toutes les cartes dans la même liste, celle de devant comprise.

            C'est ce qui fait l'échange : quand on touche une carte de la pile,
            deux positions changent dans une liste qui, elle, ne bouge pas —
            celle du haut prend la place d'en bas, celle d'en bas monte au
            sommet — et le navigateur interpole le trajet. Sorties de cette
            liste, les cartes ne s'échangeaient plus : l'une disparaissait,
            l'autre apparaissait.

            La carte de devant porte en plus une enveloppe qui recopie le
            défilement de la colonne : elle s'en va vers le haut avec le texte
            qu'elle surplombe. Les cartes rangées, elles, ne défilent pas — la
            pile du bas est le point fixe par lequel on change de carte.
          */}
          {/*
            La pile du bas, et elle seule.

            La carte de devant est revenue dans la colonne qui défile, en flux
            normal. Elle vivait ici, dans la couche fixe, et recopiait le
            défilement par une variable CSS mise à jour à chaque événement de
            scroll : sur téléphone, ces événements arrivent en retard pendant
            l'inertie, si bien que la carte traînait derrière le texte au lieu
            de faire bloc avec lui. Et posée par-dessus la colonne, elle
            interceptait le geste : une fois le texte défilé, on tirait sur une
            carte au lieu de la liste, et l'on ne remontait plus.

            C'est le prix de l'échange à deux cartes : il demandait que la
            carte de devant soit hors de la zone qui défile. Le défilement d'un
            bloc et cet échange ne peuvent pas coexister — voir la réponse qui
            accompagne cette modification.
          */}
          {others.map((card, rank) => {
            const y = entered
              ? `calc(${VH} - ${stackHeight(others.length - rank)}px)`
              : `calc(${SAFE_TOP} + ${FRONT_TOP + (rank + 1) * STACK_OFFSET}px)`;

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => focus(cards.findIndex(entry => entry.id === card.id))}
                className={`absolute ${CARD_INSET} block origin-top text-left`}
                style={{
                  transform: `translateY(${y})`,
                  transition: 'transform 420ms cubic-bezier(0.32,0.72,0,1)',
                  zIndex: rank + 1,
                  pointerEvents: 'auto',
                }}
                aria-label={card.cardCode}
              >
                <OuraCardFace
                  firstName={card.firstName}
                  lastName={card.lastName}
                  cardCode={card.cardCode}
                  expiresAt={card.expiresAt}
                  photoUrl={card.photoUrl}
                  disabled={card.isDisabled}
                  statusLabel={cardStatusLabel(card, language)}
                  shadowClassName={cardShadow}
                />
              </button>
            );
          })}

          {/*
            Tout ce qu'on lit : la carte, l'identité, les messages, dans une
            seule zone qui défile.

            C'est le navigateur qui la fait défiler, et rien d'autre — pas de
            position recopiée d'un élément à l'autre, donc pas de décalage
            pendant l'inertie et pas de carte posée par-dessus qui intercepte le
            geste.

            La pile du bas ne défile pas : c'est par elle qu'on change de carte,
            elle doit rester sous la main.
          */}
          {opened && (
            <div
              ref={columnRef}
              /* Sous les cartes rangées, jamais dessus : la colonne défile
                  derrière elles, et le dernier message glisse sous la pile au
                  lieu de la recouvrir. */
              className="scrollbar-hide absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain"
              style={{ pointerEvents: 'auto', zIndex: 0 }}
            >
              <div
                className="gl-stagger"
                style={{
                  paddingTop: `calc(${SAFE_TOP} + ${FRONT_TOP}px)`,
                  paddingBottom: stackHeight(Math.max(0, cards.length - 1)) + 16,
                }}
              >
                {/*
                  La carte, en flux normal : c'est le navigateur qui la fait
                  défiler avec le reste, sans un pas de retard.

                  Elle arrive d'en bas, d'où vient la pile, et grandit un peu en
                  chemin. La clé la remonte à chaque changement, sans quoi
                  l'animation ne se rejouerait pas.
                */}
                <div className={isPanel ? 'px-3' : 'px-1.5'}>
                  <motion.button
                    key={opened.id}
                    type="button"
                    onClick={() => focus(null)}
                    className="block w-full text-left"
                    aria-label={text.close}
                    initial={{ y: 56, scale: 0.88, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                  >
                    <OuraCardFace
                      firstName={opened.firstName}
                      lastName={opened.lastName}
                      cardCode={opened.cardCode}
                      expiresAt={opened.expiresAt}
                      photoUrl={opened.photoUrl}
                      valid={isCardValid(opened)}
                      disabled={opened.isDisabled}
                      statusLabel={cardStatusLabel(opened, language)}
                      shadowClassName={cardShadow}
                    />
                  </motion.button>
                </div>

                <div className={isPanel ? 'mt-4 px-8' : 'mt-4 px-5'}>
                {/* Carte supprimée du côté du réseau : il n'y a plus rien
                    derrière, et la seule chose à en faire est de la retirer de
                    l'appareil. */}
                {opened.isMissing && (
                  <div className="mb-4 flex justify-center">
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteOuraCard(opened.cardCode);
                        onCardsChange(cards.filter(card => card.id !== opened.id));
                        focus(null);
                      }}
                      className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow-2xl transition active:scale-95"
                    >
                      {text.removeFromWallet}
                    </button>
                  </div>
                )}

                <div className="flex flex-col">{detailContent}</div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Les actions se posent au-dessus de cette pile, jamais dessus. */}
      {safeIndex !== null && (
        <>
          {isMenuOpen && (
            <div
              className="fixed inset-0 z-[10003]"
              onClick={() => setIsMenuOpen(false)}
              aria-hidden
            />
          )}
          <div
            className="fixed bottom-0 right-0 z-[10004] flex flex-col items-end gap-2 px-4"
            style={{
              paddingBottom: `calc(max(env(safe-area-inset-bottom), 1rem) + ${stackHeight(others.length)}px)`,
            }}
          >
            {isMenuOpen && opened && (
              <div
                className={`gl-rise w-64 origin-bottom-right overflow-hidden rounded-2xl border shadow-2xl ${
                  isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
                }`}
              >
                {/* Rien à montrer à un contrôleur, rien à reporter sur un
                    nouveau support : une carte supprimée n'a plus que sa
                    suppression à offrir. */}
                {!opened.isMissing && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setControllerCard(opened);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-4 text-left transition active:bg-blue-500/10 ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  <IdentificationIcon className="h-5 w-5 flex-shrink-0 text-blue-500" />
                  <span className="text-[0.95rem] font-semibold">{text.controller}</span>
                </button>
                )}
                {!opened.isMissing && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setTransferCode('');
                    setTransferError(null);
                    setTransferStep('choice');
                    setTransferFrom(opened);
                  }}
                  className={`flex w-full items-center gap-3 border-t px-4 py-4 text-left transition active:bg-blue-500/10 ${
                    isLight ? 'border-slate-200 text-slate-900' : 'border-slate-800 text-white'
                  }`}
                >
                  <ArrowsRightLeftIcon className="h-5 w-5 flex-shrink-0 text-blue-500" />
                  <span className="text-[0.95rem] font-semibold">{text.transfer}</span>
                </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await deleteOuraCard(opened.cardCode);
                    if (!ok) return;
                    onCardsChange(cards.filter(card => card.id !== opened.id));
                    focus(null);
                  }}
                  className={`flex w-full items-center gap-3 border-t px-4 py-4 text-left text-rose-400 transition active:bg-rose-500/10 ${
                    isLight ? 'border-slate-200' : 'border-slate-800'
                  }`}
                >
                  <TrashIcon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-[0.95rem] font-semibold">{text.remove}</span>
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
            {/* Sortir de la mise en avant sans avoir à viser la carte. */}
            <button
              type="button"
              onClick={() => focus(null)}
              className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-2xl transition active:scale-90 ${
                isLight
                  ? 'border-slate-200 bg-white text-slate-700'
                  : 'border-slate-800 bg-slate-900 text-slate-200'
              }`}
              aria-label={text.close}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
            {/* Le bouton tourne d'un quart de tour à l'ouverture : le geste se
                voit, et l'icône verticale devient horizontale — elle dit alors
                que le menu est déplié. */}
            <button
              type="button"
              onClick={() => setIsMenuOpen(open => !open)}
              className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-90 ${
                isMenuOpen ? 'rotate-90 scale-110' : 'rotate-0'
              } ${
                isLight
                  ? 'border-slate-200 bg-white text-slate-700'
                  : 'border-slate-800 bg-slate-900 text-slate-200'
              }`}
              aria-label={text.more}
              aria-expanded={isMenuOpen}
            >
              <EllipsisVerticalIcon className="h-6 w-6" />
            </button>
            </div>
          </div>
        </>
      )}

      {/* Transfert : la même feuille pleine hauteur que l'ajout d'une carte —
          c'est la même démarche, elle mérite le même écran. */}
      <div
        className={`fixed inset-0 z-[10005] bg-black/50 transition-opacity duration-300 ${
          transferFrom ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setTransferFrom(null)}
        aria-hidden
      />
      <div
        className={`fixed inset-x-0 bottom-0 top-8 z-[10006] overflow-y-auto rounded-t-3xl border-t px-4 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          transferFrom ? 'translate-y-0' : 'translate-y-full'
        } ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`}
        style={{
          pointerEvents: transferFrom ? 'auto' : 'none',
          paddingBottom: 'max(env(safe-area-inset-bottom), 2rem)',
        }}
        aria-hidden={!transferFrom}
      >
        <div className="flex justify-center pb-3 pt-3">
          <span
            aria-hidden
            className={`h-1.5 w-12 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/20'}`}
          />
        </div>

        <p className={`mb-1 text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
          {text.transfer}
        </p>
        <p className="mb-4 text-sm leading-snug text-slate-500">{text.transferExplain}</p>

        {/* Le numéro se donne comme à l'ajout d'une carte : en la
            photographiant, ou en le tapant. Seul le numéro change — le nom et
            le visage suivent tout seuls. */}
        {transferStep === 'choice' && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => { setTransferError(null); setTransferStep('scan'); }}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${
                isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
              }`}
            >
              <CameraIcon className="h-5 w-5 flex-shrink-0 text-blue-500" />
              <span className={`text-[0.95rem] font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {text.transferScan}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setTransferError(null); setTransferStep('manual'); }}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${
                isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
              }`}
            >
              <PencilSquareIcon className="h-5 w-5 flex-shrink-0 text-blue-500" />
              <span className={`text-[0.95rem] font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {text.transferManual}
              </span>
            </button>
          </div>
        )}

        {transferStep === 'scan' && (
          <>
            <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '1024 / 630' }}>
              <video ref={transferVideoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-white/70" />
              {transferBusy && (
                <>
                  <div className="gl-scanning absolute inset-0 bg-black" />
                  <div className="absolute inset-0 flex items-end justify-center pb-3">
                    <span className="text-sm font-semibold text-white drop-shadow">
                      {text.transferReading}
                    </span>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              disabled={transferBusy}
              onClick={async () => {
                const video = transferVideoRef.current;
                if (!video || !video.videoWidth || !transferFrom) return;
                setTransferBusy(true);
                setTransferError(null);
                const canvas = toCanvas(video, video.videoWidth, video.videoHeight);
                stopTransferCamera();
                try {
                  const result = await scanCard(canvas);
                  if (!result.cardCode) {
                    setTransferBusy(false);
                    setTransferError(text.transferFailed);
                    setTransferStep('manual');
                    return;
                  }
                  setTransferCode(result.cardCode);
                  setTransferBusy(false);
                  setTransferStep('manual');
                } catch {
                  setTransferBusy(false);
                  setTransferError(text.transferFailed);
                  setTransferStep('manual');
                }
              }}
              className="mt-4 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {transferBusy ? text.transferReading : text.transferScan}
            </button>
          </>
        )}

        {transferStep === 'manual' && (
          <>
            <input
              value={transferCode}
              onChange={event => setTransferCode(event.target.value.replace(/\D/g, '').slice(0, 12))}
              inputMode="numeric"
              enterKeyHint="go"
              placeholder={text.transferHint}
              className={`h-14 w-full rounded-2xl border px-4 text-base tabular outline-none focus:border-blue-500 ${
                isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-slate-800 bg-slate-900 text-white'
              }`}
            />
            <button
              type="button"
              disabled={transferBusy || transferCode.length < 8}
              onClick={async () => {
                if (!transferFrom) return;
                setTransferBusy(true);
                setTransferError(null);
                const found = await lookupOuraCard(transferCode);
                const known = found ? null : await findKnownCard(transferCode);
                if (!found && !known?.isTest) {
                  setTransferBusy(false);
                  setTransferError(text.transferFailed);
                  return;
                }
                const moved = await transferCard(
                  transferFrom.cardCode,
                  found ?? { testCode: known!.cardCode },
                );
                setTransferBusy(false);
                if (!moved) {
                  setTransferError(text.transferFailed);
                  return;
                }
                const refreshed = await listOuraCards();
                onCardsChange(refreshed);
                setTransferFrom(null);
                focus(null);
              }}
              className="mt-4 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {transferBusy ? text.transferBusy : text.transferDo}
            </button>
          </>
        )}

        {transferError && (
          <p className="mt-2 text-sm font-semibold text-rose-400">{transferError}</p>
        )}
      </div>

      <NotificationDetail
        variant={isPanel ? 'dialog' : 'screen'}
        notification={openNotification}
        language={language}
        theme={theme}
        onClose={() => setOpenNotification(null)}
      />

      <ControllerView
        card={controllerCard}
        language={language}
        theme={theme}
        onClose={() => setControllerCard(null)}
      />
    </div>
  );
}
