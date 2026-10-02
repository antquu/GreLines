import { ChevronLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/solid';
import type { OuraNotification } from '../services/ouraCard';
import { formatNotificationDay } from '../utils/notificationDay';
import { openExternal } from '../utils/openExternal';

interface NotificationDetailProps {
  notification: OuraNotification | null;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  onClose: () => void;
  variant?: 'screen' | 'dialog';
}

export function NotificationDetail({ notification, language, theme = 'dark', onClose, variant = 'screen' }: NotificationDetailProps) {
  const isDialog = variant === 'dialog';
  const isFr = language === 'fr';
  const isLight = theme === 'light';
  const isOpen = notification !== null;

  return (
    <>
    {isDialog && (
      <div
        className={`fixed inset-0 z-[10005] bg-black/60 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden
      />
    )}
    <div
      className={
        isDialog
          ? `fixed left-1/2 top-1/2 z-[10006] flex max-h-[80vh] w-[min(30rem,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border shadow-2xl transition-all duration-200 ${
              isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            } ${isLight ? 'border-slate-200 bg-slate-50 text-slate-900' : 'border-slate-800 bg-slate-950 text-white'}`
          : `fixed inset-0 z-[10006] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              isOpen ? 'translate-x-0' : 'translate-x-full'
            } ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-white'}`
      }
      style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
      aria-hidden={!isOpen}
    >
      <div className="px-3" style={{ paddingTop: isDialog ? '0.75rem' : 'max(calc(var(--gl-safe-top) + 4px), 0.75rem)' }}>
        <button
          type="button"
          onClick={onClose}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 ${
            isLight ? 'bg-slate-200/70 text-slate-700' : 'bg-white/10 text-white'
          }`}
          aria-label={isFr ? 'Retour' : 'Back'}
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
      </div>

      {notification && (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-6">
          <h2 className={`text-center text-[2.125rem] font-bold leading-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {notification.title}
          </h2>
          <p className="mt-2 text-center text-base text-slate-500">
            {formatNotificationDay(notification.createdAt, language)}
          </p>

          {notification.body && (
            <div
              className={`mt-8 rounded-2xl px-5 py-4 text-[0.95rem] leading-relaxed ${
                isLight ? 'bg-slate-200/60 text-slate-800' : 'bg-white/5 text-slate-200'
              }`}
            >
              {notification.body}
            </div>
          )}

          {notification.links.length > 0 && (
            <div className="mt-5 space-y-2">
              {notification.links.map(link => (
                <button
                  key={link.url}
                  type="button"
                  onClick={() => openExternal(link.url)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-5 py-3.5 text-left transition active:scale-[0.99] ${
                    isLight ? 'bg-blue-500/10 text-blue-700' : 'bg-blue-500/15 text-blue-300'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-[0.95rem] font-bold">{link.label}</span>
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}

          <p className="mt-6 px-1 text-xs leading-snug text-slate-500">
            {isFr
              ? "Ce message vient du réseau ou de votre portefeuille. GreLines ne l'a ni relu ni modifié."
              : 'This message comes from the network or from your wallet. GreLines neither reviewed nor altered it.'}
          </p>
        </div>
      )}
    </div>
    </>
  );
}
