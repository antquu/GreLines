import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { tx } from '../i18n';

const GREEN = '#489a4e';

const DISMISSED_KEY = 'greLines_greenerBannerClosed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function GreenerBanner({ language }: { language: 'fr' | 'en' }) {
  const [closed, setClosed] = useState(wasDismissed);
  if (closed) return null;

  const dismiss = () => {
    setClosed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-3xl"
      style={{ backgroundColor: GREEN }}
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm transition active:scale-90"
        aria-label={tx(language === 'fr').greenerBanner.close}
      >
        <XMarkIcon className="h-5 w-5" style={{ color: GREEN }} />
      </button>

      <p className="px-5 pr-14 pt-4 text-[1.2rem] font-bold leading-snug text-white">
        {tx(language === 'fr').greenerBanner.thankYouForChoosing}
      </p>

      <svg
        viewBox="0 0 320 56"
        className="mt-3 block w-full"
        aria-hidden
      >
        <g fill="#ffffff">
          <path d="M4 56a30 30 0 0 0 30-30H19a15 15 0 0 1-15 15z" />
          <rect x="20" y="4" width="18" height="18" />
          <circle cx="60" cy="44" r="10" />
          <rect x="88" y="2" width="13" height="46" transform="rotate(22 94 25)" />
          <rect x="140" y="16" width="16" height="16" />
          <rect x="162" y="36" width="12" height="30" />
          <path d="M190 40a26 26 0 0 1 26-26v14a12 12 0 0 0-12 12z" />
          <rect x="240" y="34" width="18" height="18" transform="rotate(45 249 43)" />
          <circle cx="316" cy="20" r="11" />
        </g>
      </svg>
    </div>
  );
}
