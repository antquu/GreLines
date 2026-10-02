import { CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';

interface OuraCardFaceProps {
  firstName?: string;
  lastName?: string;
  cardCode?: string;
  expiresAt?: string;
  photoUrl?: string;
  valid?: boolean;
  disabled?: boolean;
  statusLabel?: string | null;
  forceFront?: boolean;
  shadowClassName?: string;
  className?: string;
}

const CARD_BOUNDS = { top: '5.5%', right: '6.4%', bottom: '7.2%', left: '6%' };

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
      {shadowClassName && (
        <div
          className={`pointer-events-none absolute rounded-[5%] ${shadowClassName}`}
          style={CARD_BOUNDS}
          aria-hidden
        />
      )}

      <img
        src={isComplete ? '/assets/oura-verso.png' : '/assets/oura.png'}
        alt="Carte OURA"
        className="block h-full w-full rounded-[4.5%] object-cover"
        style={disabled ? { filter: 'grayscale(1) brightness(0.75)' } : undefined}
        draggable={false}
      />

      {isComplete && (
        <div
          className="absolute inset-0"
          style={disabled ? { filter: 'grayscale(1) brightness(0.8)' } : undefined}
        >
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

      {statusLabel && (
        <span
          className="absolute rounded-md bg-black/70 px-2 py-0.5 font-semibold uppercase tracking-wide text-white"
          style={{ bottom: '8%', right: '7%', fontSize: '2.8cqw', fontFamily: CARD_FONT }}
        >
          {statusLabel}
        </span>
      )}

      {valid !== undefined && (
        <span
          className={`absolute flex items-center justify-center rounded-full text-white shadow-lg ${
            valid ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
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
