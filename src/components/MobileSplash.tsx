/**
 * L'écran de chargement du téléphone.
 *
 * Le logo seul sur fond noir disait que l'application démarrait, et rien de
 * plus. Une photographie de la ville dit ce qu'on va y chercher : le réseau
 * n'est pas une grille d'horaires, c'est ce qui mène quelque part. La tour
 * Perret tient l'écran, et la phrase se lit en bas, à côté de la marque.
 *
 * Deux règles le gouvernent :
 *
 *   * il reste au moins deux secondes. Une application qui démarre en trois
 *     cents millisecondes ferait clignoter l'image, ce qui est pire que de ne
 *     rien montrer ;
 *   * il part en fondu, jamais d'un coup. La carte apparaît dessous, elle ne
 *     se substitue pas.
 *
 * Sur ordinateur, rien de tout cela : l'ancien écran au logo y reste. Une
 * photographie verticale étalée sur un écran large ne montrerait que le ciel.
 */

import { useEffect, useState } from 'react';

/** Le temps minimal d'affichage, même si tout est déjà prêt. */
const MIN_VISIBLE_MS = 2000;

/** La durée du fondu, accordée à celle des autres disparitions de l'application. */
const FADE_MS = 450;

export function MobileSplash({
  done,
  language,
}: {
  /** L'application a fini de charger. L'écran ne part pas pour autant tout de suite. */
  done: boolean;
  language: 'fr' | 'en';
}) {
  const [minElapsed, setMinElapsed] = useState(false);
  const [removed, setRemoved] = useState(false);
  /* La grande image met un instant à arriver ; la petite tient l'écran en
     attendant, et la grande la recouvre sans transition visible. */
  const [fullReady, setFullReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const leaving = done && minElapsed;

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setRemoved(true), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (removed) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] w-screen overflow-hidden bg-black"
      style={{
        height: '100dvh',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        /* Rendu traversant dès qu'il s'efface : la carte est déjà là dessous,
           et l'on ne doit pas attendre la fin du fondu pour la toucher. */
        pointerEvents: leaving ? 'none' : 'auto',
      }}
      aria-hidden={leaving}
    >
      {/* La petite version d'abord, puis la grande par-dessus. */}
      <img
        src="/assets/places/tour-perret-low.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <img
        src="/assets/places/tour-perret.jpg"
        alt=""
        onLoad={() => setFullReady(true)}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ opacity: fullReady ? 1 : 0 }}
        draggable={false}
      />

      {/* L'assombrissement du bas, sur lequel s'écrit la phrase. Un dégradé,
          pas un bandeau : l'image doit s'éteindre, pas être coupée. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background:
            'linear-gradient(to top, #000 0%, rgba(0,0,0,0.88) 30%, rgba(0,0,0,0.45) 62%, rgba(0,0,0,0) 100%)',
        }}
        aria-hidden
      />

      {/* La phrase à gauche, la marque à droite. */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-5 px-7"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2.5rem)' }}
      >
        <p className="min-w-0 flex-1 text-[26px] font-extrabold leading-[1.1] tracking-tight text-white">
          {language === 'fr'
            ? 'Mettre la culture dans les transports'
            : 'Bringing culture into transport'}
        </p>
        <img
          src="/flavicon.png"
          alt="GreLines"
          className="h-14 w-14 flex-shrink-0 rounded-[14px]"
          draggable={false}
        />
      </div>
    </div>
  );
}
