import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { isImageLoadingForced, subscribeImageLoadingForced } from '../utils/forcedImageLoading';
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

export function PlacesCarousel({
  language,
  isLight,
  onNavigate,
}: {
  language: 'fr' | 'en';
  isLight: boolean;
  onNavigate?: (place: Place) => void;
}) {
  const places = useMemo(() => grenoblePlaces(language), [language]);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = places.find(place => place.id === openId) ?? null;

  useEffect(() => prefetchFullImages(places.map(place => place.image)), [places]);

  return (
    <>
      <div className="-mx-5 flex snap-x snap-mandatory scroll-p-5 gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {places.map(place => (
          <button
            key={place.id}
            type="button"
            onClick={() => setOpenId(place.id)}
            className="w-[calc((100%-0.75rem)/2)] flex-shrink-0 snap-start transition active:scale-[0.98]"
          >
            <PlaceImage source={place.image} className="aspect-[5/6] w-full rounded-[18px]" isLight={isLight} />
            <div className="mt-4">
              <p
                className={`px-0.5 text-center text-[0.9375rem] font-extrabold leading-tight ${
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

function PlaceImage({ source, className = '', isLight = false }: { source: string; className?: string; isLight?: boolean }) {
  const set = useMemo(() => placeImageSet(source), [source]);
  const src = usePlaceSrc(set);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const markIfReady = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) setLoaded(true);
  }, []);
  const forcedLoading = useSyncExternalStore(subscribeImageLoadingForced, isImageLoadingForced, () => false);
  const shown = loaded && !forcedLoading;

  if (failed) {
    return (
      <div
        className={`bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 ${className}`}
        aria-hidden
      />
    );
  }

  const positioned = /(^|\s)(absolute|fixed)(\s|$)/.test(className) ? '' : 'relative';

  return (
    <div className={`${positioned} overflow-hidden ${className} ${shown ? '' : `gl-shimmer ${isLight ? 'gl-shimmer-light' : ''}`}`}>
      <img
        ref={markIfReady}
        src={src}
        alt=""
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
        style={{ opacity: shown ? 1 : 0 }}
      />
    </div>
  );
}

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

  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

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
        <p className="text-[1.0625rem] font-bold leading-tight text-white">{place.title}</p>
        <div className="mt-0.5">
          <p className="text-[1.0625rem] leading-tight text-white/80">{place.kicker}</p>
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

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex flex-col bg-black transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
      style={{ transform: entered ? 'translateY(0)' : 'translateY(100%)' }}
    >
      <PlaceImage source={place.image} className="absolute inset-0 h-full w-full" />

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
        style={{ paddingTop: 'calc(var(--gl-safe-top) + 0.75rem)' }}
      >
        {header}
      </div>

      <div className="min-h-0 flex-1" aria-hidden />

      <div
        className="relative flex-shrink-0 px-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}
      >
        <h2
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
          <p className="min-w-0 flex-1 text-[1rem] font-normal leading-snug text-white/85">
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

      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
          detailsOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setDetailsOpen(false)}
        aria-hidden
      />
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-[28px] bg-[#161616] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          detailsOpen ? '' : 'pointer-events-none'
        }`}
        style={{
          top: 'max(3.5rem, calc(var(--gl-safe-top) + 0.5rem))',
          transform: detailsOpen ? 'translateY(0)' : 'translateY(100%)',
        }}
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
                <div key={paragraphIndex} className="mt-5">
                  <p className="text-[1.125rem] leading-relaxed text-white/90">
                    {renderWithLineBadges(paragraph)}
                  </p>
                </div>
              ))}
            </section>
          ))}

          <div className="mt-12">
          <p className="text-[0.8125rem] leading-relaxed text-white/40">
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
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-blue-600 text-[1.0625rem] font-bold text-white transition active:scale-[0.98]"
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

function renderWithLineBadges(text: string): React.ReactNode[] {
  return text.split(/\[\[([^\]]+)\]\]/g).map((chunk, index) =>
    index % 2 === 0 ? (
      chunk
    ) : (
      <span key={index} className="mx-0.5 inline-flex align-middle" style={{ transform: 'translateY(-0.1em)' }}>
        <LineBadge line={{ id: `SEM:${chunk}`, shortName: chunk }} size="xs" />
      </span>
    ),
  );
}
