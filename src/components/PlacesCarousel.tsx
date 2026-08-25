/**
 * Les lieux à visiter, en pellicule.
 *
 * Une bande d'images qui défile sous le pouce, puis, quand on en touche une,
 * la photographie en grand : l'écran entier, sans cadre ni marge. C'est la
 * seule partie de l'application qui ne montre ni horaire ni ligne — elle
 * répond à l'autre question du voyageur, celle de savoir où il va.
 *
 * Le texte ne se pose pas sur la photographie : il attend en dessous, dans le
 * noir, et l'on fait monter la feuille quand on veut le lire. Une photographie
 * couverte de paragraphes n'est plus une photographie, et un paragraphe posé
 * sur un ciel ne se lit pas.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUpIcon, MapPinIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { grenoblePlaces, type Place } from '../services/places';
import { LineBadge } from './LineBadge';
import {
  initialPlaceSrc,
  fetchFullImage,
  placeImageSet,
  prefetchFullImages,
  type PlaceImageSet,
} from '../services/placeImages';

/**
 * La bande de vignettes.
 *
 * Elle déborde des marges de la feuille — une pellicule coupée par le bord de
 * l'écran dit qu'elle continue, là où une bande sagement rangée dans la marge
 * aurait l'air terminée.
 */
export function PlacesCarousel({
  language,
  isLight,
  onNavigate,
}: {
  language: 'fr' | 'en';
  isLight: boolean;
  /** « Y aller » : le lieu devient la destination, et les feuilles s'effacent. */
  onNavigate?: (place: Place) => void;
}) {
  const places = useMemo(() => grenoblePlaces(language), [language]);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = places.find(place => place.id === openId) ?? null;

  /*
   * Les grandes images se téléchargent pendant qu'on est ailleurs.
   *
   * Le carrousel n'en montre que des vignettes ; c'est en ouvrant un lieu
   * qu'on a besoin de la photographie entière. On profite donc du temps passé
   * dans l'application — quelques minutes à regarder des horaires — pour les
   * ramener une par une, en dehors des moments chargés. Celui qui n'ouvre
   * jamais un lieu aura tout de même payé le téléchargement : c'est le prix à
   * accepter pour que celui qui l'ouvre n'attende pas.
   */
  useEffect(() => prefetchFullImages(places.map(place => place.image)), [places]);

  return (
    <>
      {/* `scroll-p-5` autant que `px-5` : l'accroche cale la vignette sur le
          bord du conteneur, et sans marge de défilement elle mangeait la
          gouttière — la première image démarrait pile au bord de la feuille. */}
      <div className="-mx-5 flex snap-x snap-mandatory scroll-p-5 gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {places.map(place => (
          <button
            key={place.id}
            type="button"
            onClick={() => setOpenId(place.id)}
            className="w-[42%] flex-shrink-0 snap-start transition active:scale-[0.98]"
          >
            <PlaceImage source={place.image} className="aspect-[5/6] w-full rounded-[18px]" />
            {/* Le nom sous l'image, centré : il appartient à la photographie
                au-dessus de lui, pas à la colonne de texte de la feuille. Aligné
                à gauche, il tirait vers la marge et se rattachait à la vignette
                suivante. */}
            {/* L'écart est porté par une div : `p { margin: 0 }` est déclaré
                hors layer dans index.css et annule tout `mt-*` posé sur un
                paragraphe — le nom restait collé sous l'image. */}
            <div className="mt-4">
              <p
                className={`px-0.5 text-center text-[15px] font-extrabold leading-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {place.card}
              </p>
            </div>
          </button>
        ))}
      </div>

      {opened && (
        <PlaceViewer
          place={opened}
          language={language}
          onClose={() => setOpenId(null)}
          /* Le plein écran se retire avant que la page ne bascule : il est posé
             sur le corps du document, et les feuilles qui s'effacent en dessous
             ne l'emportaient pas avec elles. */
          onNavigate={
            onNavigate
              ? place => {
                  setOpenId(null);
                  onNavigate(place);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

/**
 * L'adresse à afficher pour une photographie, à cet instant.
 *
 * Commence par la petite version si la ligne est courte, puis passe à la
 * grande dès qu'elle est là. Le passage ne se voit pas : l'image est déjà au
 * cache quand la balise reçoit sa nouvelle adresse.
 */
function usePlaceSrc(set: PlaceImageSet): string {
  const [src, setSrc] = useState(() => initialPlaceSrc(set));

  useEffect(() => {
    if (src === set.full) return;
    let alive = true;
    void fetchFullImage(set.full).then(() => {
      if (alive) setSrc(set.full);
    });
    return () => {
      alive = false;
    };
  }, [set.full, src]);

  return src;
}

/**
 * Une photographie, ou ce qui la remplace.
 *
 * Un fichier peut manquer, une ligne peut tomber. Une icône d'image cassée
 * ferait croire à une panne de l'application : on retombe donc sur un dégradé,
 * qui n'est pas une photographie mais n'a pas l'air abîmé.
 */
function PlaceImage({ source, className = '' }: { source: string; className?: string }) {
  const set = useMemo(() => placeImageSet(source), [source]);
  const src = usePlaceSrc(set);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 ${className}`}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}

/**
 * Le lieu en grand.
 *
 * Toujours sombre, quel que soit le thème : c'est une photographie qu'on
 * regarde, et une photographie se regarde sur du noir. Le clair, ici, ne dirait
 * rien de plus — il ne ferait que blanchir les bords de l'image.
 */
function PlaceViewer({
  place,
  language,
  onClose,
  onNavigate,
}: {
  place: Place;
  language: 'fr' | 'en';
  onClose: () => void;
  onNavigate?: (place: Place) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const fr = language === 'fr';

  /*
   * L'arrivée par le bas.
   *
   * La vue apparaissait d'un coup, à la place de la feuille d'accueil, et l'on
   * ne savait pas d'où elle venait. Elle monte donc depuis le bas de l'écran,
   * comme la vignette qu'on vient de toucher : la couche naît en bas, puis on
   * la relève à l'image suivante, le navigateur ayant alors quelque chose à
   * interpoler.
   */
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /* Le fond ne défile pas derrière le plein écran : la page reprend son
     défilement quand on referme. */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /* Échap referme, un volet à la fois : la feuille d'abord, l'image ensuite.
     Refermer les deux d'un coup ferait disparaître la photographie qu'on
     voulait seulement dégager. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (detailsOpen) setDetailsOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailsOpen, onClose]);

  const header = (
    <div className="flex items-start gap-3 px-6">
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-bold leading-tight text-white">{place.title}</p>
        <div className="mt-0.5">
          <p className="text-[17px] leading-tight text-white/80">{place.kicker}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={detailsOpen ? () => setDetailsOpen(false) : onClose}
        aria-label={fr ? 'Fermer' : 'Close'}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/90 transition active:scale-90"
      >
        <XMarkIcon className="h-6 w-6 text-slate-900" />
      </button>
    </div>
  );

  /*
   * Le plein écran est posé sur le corps du document, et non là où il est
   * écrit.
   *
   * La feuille d'accueil se déplace par `transform` : un ancêtre transformé
   * devient le repère des positions fixes qu'il contient, si bien que
   * `inset-0` désignait la feuille et non l'écran. La vue restait rangée sous
   * le pouce, découpée par le bord de la feuille.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex flex-col bg-black transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
      style={{ transform: entered ? 'translateY(0)' : 'translateY(100%)' }}
    >
      {/* La photographie tient tout l'écran ; le noir n'est qu'un voile posé
          dessus. Elle était auparavant rangée dans le haut, le texte dans un
          bloc noir en dessous : deux zones séparées par une arête franche, qui
          coupait l'image en travers. */}
      <PlaceImage source={place.image} className="absolute inset-0 h-full w-full" />

      {/* Deux dégradés, aucun bandeau.
          En haut, de quoi tenir le titre blanc s'il tombe sur un ciel clair. En
          bas, la descente vers le noir où s'écrit le reste : elle commence
          transparente à mi-hauteur et n'est franchement opaque que sous la
          phrase, si bien que l'image s'éteint au lieu de s'arrêter. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-56"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 45%, rgba(0,0,0,0) 100%)',
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%]"
        style={{
          background:
            'linear-gradient(to top, #000 0%, #000 28%, rgba(0,0,0,0.82) 46%, rgba(0,0,0,0.35) 72%, rgba(0,0,0,0) 100%)',
        }}
        aria-hidden
      />

      <div
        className="relative flex-shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        {header}
      </div>

      {/* Ce qui pousse le titre en bas de l'écran. */}
      <div className="min-h-0 flex-1" aria-hidden />

      {/* Le grand titre, la phrase, et la flèche qui appelle le reste. */}
      <div
        className="relative flex-shrink-0 px-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}
      >
        {/* Le titre porte l'écran : c'est le nom du lieu, il doit se lire de
            loin et occuper la place que prend un titre. La phrase en dessous
            n'est qu'une légende, et elle se tient en retrait, sans gras. */}
        <h2
          /* Taille, graisse et couleur en clair : `h1, h2 { … }` est déclaré
             hors layer dans index.css et l'emportait sur les classes, ramenant
             le titre à vingt pixels dans la couleur du thème. */
          style={{
            fontSize: '52px',
            lineHeight: 0.98,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#ffffff',
            margin: 0,
          }}
        >
          {place.headline}
        </h2>
        <div className="mt-5 flex items-end gap-4">
          <p className="min-w-0 flex-1 text-[16px] font-normal leading-snug text-white/85">
            {place.tagline}
          </p>
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            aria-label={fr ? 'Voir les informations' : 'Show the details'}
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-white transition active:scale-90"
          >
            <ChevronUpIcon className="h-8 w-8 text-slate-900" />
          </button>
        </div>
      </div>

      {/* Ce qu'on lit quand on a fini de regarder.
          La feuille couvre l'écran mais laisse voir la photographie assombrie
          au-dessus d'elle : on n'a pas changé de page, on a soulevé un volet. */}
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
          detailsOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setDetailsOpen(false)}
        aria-hidden
      />
      <div
        /* La glissière est écrite en clair plutôt qu'en classes : `translate-y-*`
           passe en Tailwind 4 par une variable, et la variable de la classe
           partante restait appliquée — la feuille gardait son nom de classe
           d'arrivée en restant en bas de l'écran. */
        className={`absolute inset-x-0 bottom-0 top-14 flex flex-col rounded-t-[28px] bg-[#161616] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          detailsOpen ? '' : 'pointer-events-none'
        }`}
        style={{ transform: detailsOpen ? 'translateY(0)' : 'translateY(100%)' }}
        role="dialog"
        aria-label={place.title}
      >
        <div className="flex-shrink-0 pt-6">{header}</div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-6 pt-8"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}
        >
          {place.sections.map((section, index) => (
            <section key={section.heading ?? index} className={index > 0 ? 'mt-10' : ''}>
              {section.heading && (
                <h3
                  /* Même raison que le grand titre : `.text-size-* h3` fixe une
                     taille hors layer, que les classes ne peuvent pas défaire. */
                  style={{
                    fontSize: '26px',
                    lineHeight: 1.15,
                    fontWeight: 800,
                    color: '#ffffff',
                    margin: 0,
                  }}
                >
                  {section.heading}
                </h3>
              )}
              {section.body.map((paragraph, paragraphIndex) => (
                /* L'écart est porté par une div : `p { margin: 0 }` est déclaré
                   hors layer dans index.css et annule tout `mt-*` posé sur un
                   paragraphe. */
                <div key={paragraphIndex} className="mt-5">
                  <p className="text-[18px] leading-relaxed text-white/90">
                    {renderWithLineBadges(paragraph)}
                  </p>
                </div>
              ))}
            </section>
          ))}

          {/* La mention de la photographie, en dernier.
              Le lien de licence ne se signale pas : ni bleu, ni gras, ni plus
              gros que le reste — juste souligné, parce qu'une licence doit
              rester atteignable. Ce n'est pas un lien qu'on va suivre, c'est
              une dette qu'on paie. */}
          <div className="mt-12">
          <p className="text-[13px] leading-relaxed text-white/40">
            {fr ? 'Photo : ' : 'Photo: '}
            {place.credit.author},{' '}
            <a
              href={place.credit.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-white/40 underline decoration-white/25 underline-offset-2"
            >
              {place.credit.license}
            </a>
            {', via Wikimedia Commons'}
          </p>
          </div>
        </div>

        {/* « Y aller », posé sur le bas de la feuille.
            Il ne défile pas avec le texte : c'est l'action de l'écran, et on
            doit pouvoir la prendre sans avoir à lire jusqu'au bout. Le voile
            au-dessus de lui évite que la dernière ligne ne vienne se coller
            sous le bouton. */}
        {onNavigate && (
          <div className="relative flex-shrink-0">
            <div
              className="pointer-events-none absolute inset-x-0 bottom-full h-8"
              style={{ background: 'linear-gradient(to top, #161616, rgba(22,22,22,0))' }}
              aria-hidden
            />
            <div
              className="bg-[#161616] px-6 pt-2"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
            >
              <button
                type="button"
                onClick={() => onNavigate(place)}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-blue-600 text-[17px] font-bold text-white transition active:scale-[0.98]"
              >
                <MapPinIcon className="h-5 w-5" />
                {fr ? 'Y aller' : 'Take me there'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Le texte, avec les pastilles de lignes à la place de leurs noms.
 *
 * Une lettre au milieu d'une phrase ne dit pas grand-chose ; la pastille bleue
 * du tram B, elle, est ce qu'on cherche des yeux sur un plan et sur un quai.
 * Le texte porte donc `[[B]]`, et c'est ici que la pastille apparaît.
 *
 * L'identifiant est préfixé `SEM:`, comme dans le reste de l'application :
 * c'est par lui que la table des couleurs officielles est consultée.
 */
function renderWithLineBadges(text: string): React.ReactNode[] {
  return text.split(/\[\[([^\]]+)\]\]/g).map((chunk, index) =>
    index % 2 === 0 ? (
      chunk
    ) : (
      /* `align-middle` sur une pastille posée dans un paragraphe : sans lui,
         elle repose sur la ligne de base et pousse l'interligne. */
      <span key={index} className="mx-0.5 inline-flex translate-y-1 align-baseline">
        <LineBadge line={{ id: `SEM:${chunk}`, shortName: chunk }} size="xs" />
      </span>
    ),
  );
}
