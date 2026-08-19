import { useEffect, useRef, useState } from 'react';

const TRACK_HEIGHT = 36;
/** Épaisseurs aux deux bouts. Le cône va de l'une à l'autre. */
const CAP_LEFT = 10;
const CAP_RIGHT = 34;

/**
 * Le cône, dessiné avec ses deux bouts ronds.
 *
 * Un `clip-path` en polygone donnait la bonne silhouette mais des extrémités
 * coupées à la serpe. Les demi-cercles ne se font proprement qu'en SVG, et
 * seulement à l'échelle réelle : dessiner dans un repère normalisé puis étirer
 * transformerait les cercles en ellipses, d'autant plus visibles que l'écran est
 * large. On mesure donc la largeur avant de tracer.
 */
function conePath(width: number): string {
  const cy = TRACK_HEIGHT / 2;
  const r1 = CAP_LEFT / 2;
  const r2 = CAP_RIGHT / 2;
  const x1 = r1;
  const x2 = Math.max(x1 + 1, width - r2);
  return [
    `M ${x1} ${cy - r1}`,
    `L ${x2} ${cy - r2}`,
    `A ${r2} ${r2} 0 0 1 ${x2} ${cy + r2}`,
    `L ${x1} ${cy + r1}`,
    `A ${r1} ${r1} 0 0 1 ${x1} ${cy - r1}`,
    'Z',
  ].join(' ');
}

/**
 * Un curseur à crans, avec une pastille qu'on traîne.
 *
 * Une suite de boutons aurait suffi à choisir parmi cinq valeurs, mais un
 * réglage d'allure se pense comme un continuum : on veut *plus* ou *moins*
 * vite, pas « l'option numéro trois ». La piste se remplit à mesure, la pastille
 * suit le doigt, et les crans restent visibles pour qu'on sache où l'on peut
 * s'arrêter.
 *
 * Le glissement lit la position du doigt sur la largeur de la piste plutôt que
 * de compter les déplacements : on peut donc sauter d'un bout à l'autre d'un
 * seul geste, et poser le doigt directement sur le cran voulu.
 */
export function StepSlider({
  count,
  value,
  emoji,
  color = '#22c55e',
  onChange,
  ariaLabel,
}: {
  count: number;
  value: number;
  /** Ce qui s'affiche dans la pastille, et qui change avec la valeur. */
  emoji: string;
  color?: string;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // Un identifiant par curseur : deux `clipPath` de même nom dans un document
  // se marchent dessus, et les deux réglages sont côte à côte.
  const clipId = useRef(`slider-fill-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const element = trackRef.current;
    if (!element) return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pick = (clientX: number) => {
    const track = trackRef.current;
    if (!track || count < 2) return;
    const rect = track.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(1, rect.width);
    const next = Math.round(ratio * (count - 1));
    const clamped = Math.min(count - 1, Math.max(0, next));
    if (clamped !== value) onChange(clamped);
  };

  const ratio = count > 1 ? value / (count - 1) : 0;
  // Le remplissage s'arrête sous la pastille, pas à son bord gauche.
  const fillWidth = Math.max(CAP_LEFT, ratio * width + CAP_LEFT / 2);

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={(e) => {
        // On capture le pointeur : le doigt peut sortir de la piste sans que le
        // réglage s'interrompe, ce qui arrive tout le temps sur une bande de
        // seize pixels de haut.
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 0) return;
        pick(e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onChange(Math.max(0, value - 1));
        if (e.key === 'ArrowRight') onChange(Math.min(count - 1, value + 1));
      }}
      className="relative h-11 cursor-pointer touch-none select-none"
    >
      {/* La piste s'évase de gauche à droite.
          Une bande d'épaisseur constante ne dit rien : elle demande de lire
          l'étiquette pour savoir de quel côté est « plus ». Le cône porte le
          sens du réglage dans sa forme — plus large veut dire plus vite, et
          l'on comprend le curseur avant de l'avoir lu.

          Le remplissage réutilise exactement le même tracé, découpé à la
          position courante : deux cônes distincts ne se superposeraient jamais
          au pixel près, et la bordure du remplissage dépasserait de la piste. */}
      {width > 0 && (
        <svg
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2"
          width={width}
          height={TRACK_HEIGHT}
          aria-hidden
        >
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={fillWidth} height={TRACK_HEIGHT} />
            </clipPath>
          </defs>
          <path d={conePath(width)} fill="rgba(51,65,85,0.6)" />
          <path d={conePath(width)} fill={color} clipPath={`url(#${clipId})`} />
        </svg>
      )}

      {/* Les crans grossissent avec la piste. */}
      <div className="absolute inset-x-4 top-1/2 flex -translate-y-1/2 items-center justify-between">
        {Array.from({ length: count }).map((_, i) => {
          const size = 6 + (i / Math.max(1, count - 1)) * 6;
          return (
            <span
              key={i}
              className="rounded-full"
              style={{
                width: size,
                height: size,
                backgroundColor:
                  i <= value ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
              }}
            />
          );
        })}
      </div>

      {/* La pastille grandit elle aussi, et porte l'émoji du cran choisi — c'est
          ce qui rend le réglage lisible sans lire l'étiquette. */}
      <div
        className="pointer-events-none absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-all duration-150"
        style={{
          left: `calc(${ratio * 100}% - ${ratio * 2.75}rem + 1.375rem)`,
          width: 28 + ratio * 16,
          height: 28 + ratio * 16,
          fontSize: 13 + ratio * 7,
        }}
      >
        <span aria-hidden>{emoji}</span>
      </div>
    </div>
  );
}
