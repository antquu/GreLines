/**
 * Une carte OURA, dessinée.
 *
 * Tant qu'on ne sait rien du porteur, la carte se montre de face : c'est le
 * carton générique, celui qu'on reconnaît à ses couleurs. Dès qu'on a un nom,
 * un visage et un numéro, elle se retourne — le verso est la face qui parle,
 * et le gabarit `oura-verso.png` en fournit le décor vide, que l'on complète.
 *
 * Le texte ajouté est en Arial, comme celui qui est imprimé sur le carton :
 * une autre fonte se verrait immédiatement à côté des mentions du gabarit.
 *
 * Tout est posé en pourcentages du gabarit et dimensionné en `cqw`, l'unité
 * qui suit la largeur du conteneur : la carte reste juste qu'elle fasse la
 * largeur d'un téléphone ou celle d'une vignette empilée.
 */

import { CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';

interface OuraCardFaceProps {
  firstName?: string;
  lastName?: string;
  cardCode?: string;
  expiresAt?: string;
  photoUrl?: string;
  /** Pastille d'état, posée sur le coin. Absente si l'on ne sait rien. */
  valid?: boolean;
  /** Carte coupée : elle se montre grise et le dit. */
  disabled?: boolean;
  /** Ce qui est écrit dans son coin quand elle ne vaut plus. */
  statusLabel?: string | null;
  /** Force le recto, même quand on saurait remplir le verso. */
  forceFront?: boolean;
  /**
   * L'ombre portée de la carte.
   *
   * Elle ne se pose pas sur l'élément : le gabarit laisse une marge
   * transparente tout autour du carton, et une ombre posée sur le cadre
   * dessinait un rectangle flottant à un demi-centimètre de la carte — visible
   * comme une bordure sur fond clair. On la donne donc à une couche calée sur
   * les bords réels du carton, glissée dessous.
   */
  shadowClassName?: string;
  className?: string;
}

/**
 * Les bords réels du carton dans le gabarit, en pourcentages de l'image.
 * Mesurés sur la zone opaque des deux PNG.
 */
const CARD_BOUNDS = { top: '5.5%', right: '6.4%', bottom: '7.2%', left: '6%' };

/** La fonte du carton. */
const CARD_FONT = 'Arial, Helvetica, sans-serif';

function formatExpiry(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export function OuraCardFace({
  firstName,
  lastName,
  cardCode,
  expiresAt,
  photoUrl,
  valid,
  disabled = false,
  statusLabel,
  forceFront = false,
  shadowClassName = '',
  className = '',
}: OuraCardFaceProps) {
  const isComplete = Boolean(!forceFront && cardCode && (firstName || lastName));

  return (
    <div
      className={`relative w-full rounded-[4.5%] ${className}`}
      style={{ containerType: 'inline-size', aspectRatio: '1024 / 630' }}
    >
      {/* L'ombre, calée sur le carton et non sur le gabarit. */}
      {shadowClassName && (
        <div
          className={`pointer-events-none absolute rounded-[5%] ${shadowClassName}`}
          style={CARD_BOUNDS}
          aria-hidden
        />
      )}

      {/* Une carte coupée perd ses couleurs : on la reconnaît avant même
          d'avoir lu ce qui est écrit dessus. */}
      <img
        src={isComplete ? '/assets/oura-verso.png' : '/assets/oura.png'}
        alt="Carte OURA"
        className="block h-full w-full rounded-[4.5%] object-cover"
        style={disabled ? { filter: 'grayscale(1) brightness(0.75)' } : undefined}
        draggable={false}
      />

      {/* `inset-0` et non un simple conteneur : un filtre fait de l'élément le
          repère des positions absolues qu'il contient. Sans étendue propre, il
          renvoyait tout le texte de la carte sous l'image. */}
      {isComplete && (
        <div
          className="absolute inset-0"
          style={disabled ? { filter: 'grayscale(1) brightness(0.8)' } : undefined}
        >
          {/* Le visage prend la case laissée vide par le gabarit. */}
          {photoUrl && (
            <img
              src={photoUrl}
              alt=""
              className="absolute object-cover"
              style={{ left: '9.2%', top: '11.2%', width: '19%', height: '36.4%' }}
              draggable={false}
              onError={event => { event.currentTarget.style.display = 'none'; }}
            />
          )}

          {/* Prénom et nom se touchent presque : c'est un seul bloc, pas deux
              lignes qui se suivent. */}
          <div
            className="absolute uppercase text-[#0b2a4a]"
            style={{
              left: '33%',
              top: '32.5%',
              fontFamily: CARD_FONT,
              fontSize: '3.7cqw',
              lineHeight: 1.02,
              letterSpacing: '-0.01em',
            }}
          >
            <div>{firstName}</div>
            <div style={{ fontWeight: 700 }}>{lastName}</div>
          </div>

          <div
            className="absolute text-[#0b2a4a]"
            style={{
              left: '57.5%',
              top: '48.4%',
              fontFamily: CARD_FONT,
              fontSize: '3.1cqw',
              fontWeight: 700,
            }}
          >
            {formatExpiry(expiresAt)}
          </div>

          {/* Le numéro ne se groupe pas : il s'écrit d'un bloc, comme il est
              gravé et comme l'API l'attend. */}
          <div
            className="absolute tabular text-[#0b2a4a]"
            style={{
              left: '46%',
              top: '57.2%',
              fontFamily: CARD_FONT,
              fontSize: '3.1cqw',
              fontWeight: 700,
            }}
          >
            {cardCode}
          </div>
        </div>
      )}

      {/* Qui l'a coupée s'écrit sur la carte : c'est ce qu'on regarde en
          premier quand elle ne passe plus. */}
      {statusLabel && (
        <span
          className="absolute rounded-md bg-black/70 px-2 py-0.5 font-semibold uppercase tracking-wide text-white"
          style={{ bottom: '8%', right: '7%', fontSize: '2.8cqw', fontFamily: CARD_FONT }}
        >
          {statusLabel}
        </span>
      )}

      {/* État de la carte, au coin. Vert : elle vaut. Rouge : elle ne vaut
          plus, et il vaut mieux le savoir avant le contrôle. */}
      {valid !== undefined && (
        <span
          className={`absolute flex items-center justify-center rounded-full text-white shadow-lg ${
            valid ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
          /* Le gabarit laisse une marge transparente autour du carton : la
             pastille se pose donc à l'intérieur de cette marge, sur la carte
             elle-même, et non dans le vide qui l'entoure. */
          style={{ top: '2%', right: '1.5%', width: '9cqw', height: '9cqw' }}
          aria-label={valid ? 'Carte valide' : 'Carte non valide'}
        >
          {valid
            ? <CheckIcon style={{ width: '6cqw', height: '6cqw' }} />
            : <XMarkIcon style={{ width: '6cqw', height: '6cqw' }} />}
        </span>
      )}
    </div>
  );
}
