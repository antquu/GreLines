import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/solid';
import { useState, useEffect } from 'react';
import type { StopDetail } from '../types';
import { resolveLineStyle } from '../utils/lineColors';
import {
  setFavoriteAndNotify,
  getFavorite,
  FAVORITES_MAX,
  getFavorites,
} from '../services/favorites';

interface AddFavoriteModalProps {
  isOpen: boolean;
  onClose: () => void;
  stop: StopDetail | null;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
}

function getText(language: 'fr' | 'en') {
  const isFr = language === 'fr';
  return {
    title: isFr ? 'Nouveau favori' : 'New favorite',
    edit: isFr ? 'Modifier le favori' : 'Edit favorite',
    subtitle: isFr ? 'Lignes \u00e0 suivre' : 'Lines to track',
    allLines: isFr ? 'Toutes' : 'All',
    pick: isFr ? 'Au choix' : 'Selected',
    cancel: isFr ? 'Annuler' : 'Cancel',
    save: isFr ? 'Enregistrer le favori' : 'Save favorite',
    capReached: isFr
      ? `Limite atteinte : ${FAVORITES_MAX} favoris. Retirez-en un pour en ajouter un autre.`
      : `Limit reached: ${FAVORITES_MAX} favorites. Remove one to add another.`,
    noLines: isFr ? 'Aucune ligne ne dessert cet arr\u00eat.' : 'No line serves this stop.',
    allHint: isFr
      ? 'Chaque ligne qui dessert l\u2019arr\u00eat appara\u00eetra dans le favori.'
      : 'Every line serving this stop will appear in the favorite.',
    pickHint: isFr
      ? 'Touchez les lignes \u00e0 garder dans le favori.'
      : 'Tap the lines to keep in the favorite.',
    countSelected: (n: number) =>
      isFr ? `${n} ligne${n > 1 ? 's' : ''} s\u00e9lectionn\u00e9e${n > 1 ? 's' : ''}` : `${n} line${n > 1 ? 's' : ''} selected`,
  };
}

interface MinimalLine {
  id: string;
  shortName?: string;
  name?: string;
  color?: string;
  textColor?: string;
  type?: string;
}

function priority(l: MinimalLine) {
  const n = (l.shortName || l.id).toUpperCase();
  if (n === 'A' || n === 'B' || n === 'C' || n === 'D' || n === 'E') return 0;
  if (/^C\d+$/.test(n)) return 1;
  return 2;
}

function sortLines(lines: MinimalLine[]): MinimalLine[] {
  return [...lines].sort((a, b) => {
    const dp = priority(a) - priority(b);
    if (dp !== 0) return dp;
    return (a.shortName || a.id).localeCompare(b.shortName || b.id, undefined, {
      numeric: true,
    });
  });
}

function isRoundLine(label: string): boolean {
  const n = label.toUpperCase().trim();
  if (n === 'A' || n === 'B' || n === 'C' || n === 'D' || n === 'E') return true;
  return /^C\d+$/.test(n);
}

const getBadgeShapeClass = (isRound: boolean) => (isRound ? 'rounded-full' : 'rounded-2xl');

/** Line badge, styled exactly like the ones in Sidebar's line filter row. */
function LineBadge({ line, size = 'md' }: { line: MinimalLine; size?: 'sm' | 'md' }) {
  const label = line.shortName || line.id;
  const round = isRoundLine(label);
  const style = resolveLineStyle(line.id, line.color, line.textColor);
  const dim = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div
      className={`${dim} ${getBadgeShapeClass(round)} flex items-center justify-center font-bold flex-shrink-0 ${
        !style.backgroundColor ? 'bg-slate-700 text-white' : ''
      }`}
      style={style}
    >
      {label}
    </div>
  );
}

export function AddFavoriteModal(props: AddFavoriteModalProps) {
  const { isOpen, onClose, stop, language, theme = 'dark' } = props;
  const text = getText(language);
  const isLight = theme === 'light';
  const shellClass = isLight
    ? 'bg-white border border-slate-200/90'
    : 'bg-slate-950/96 border border-slate-800/90';
  const titleClass = isLight ? 'text-slate-900' : 'text-white';
  const mutedClass = isLight ? 'text-slate-500' : 'text-slate-400';
  const panelClass = isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60';

  const [mode, setMode] = useState<'all' | 'pick'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !stop) return;
    const existing = getFavorite(stop.id);
    if (existing) {
      if (existing.lines === 'all') {
        setMode('all');
        setPicked(new Set());
      } else {
        setMode('pick');
        setPicked(new Set(existing.lines));
      }
    } else {
      setMode('all');
      setPicked(new Set());
    }
  }, [isOpen, stop?.id]);

  if (!stop) return null;

  const sortedLines = sortLines((stop.lines || []) as MinimalLine[]);
  const isExisting = !!getFavorite(stop.id);
  const atCap = !isExisting && getFavorites().length >= FAVORITES_MAX;

  function togglePick(lineId: string) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function handleSave() {
    if (!stop) return;
    if (atCap) return;
    const lines: 'all' | string[] = mode === 'all' ? 'all' : Array.from(picked);
    if (mode === 'pick' && (lines as string[]).length === 0) return;
    setFavoriteAndNotify({
      stopId: stop.id,
      stopName: stop.name,
      city: stop.city,
      lines,
      addedAt: getFavorite(stop.id)?.addedAt ?? Date.now(),
    });
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            style={{ zIndex: 10000 }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 flex items-center justify-center px-4 pointer-events-none"
            style={{ zIndex: 10001 }}
          >
            <div className={`${shellClass} rounded-[32px] shadow-2xl w-full max-w-md max-h-[84vh] overflow-hidden flex flex-col pointer-events-auto`}>
              <div className="flex justify-center pt-3">
                <div className={`h-1.5 w-16 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/20'}`} />
              </div>

              {/* Header */}
              <div className={`flex items-start justify-between gap-3 px-5 pt-4 pb-4 flex-shrink-0 border-b ${isLight ? 'border-slate-200' : 'border-slate-800/80'}`}>
                <div className="min-w-0 flex-1">
                  <p className={`signal-label ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>{isExisting ? text.edit : text.title}</p>
                  <h2 className={`mt-1.5 text-[26px] font-extrabold leading-[1.1] tracking-tight ${titleClass}`}>
                    {stop.name}
                  </h2>
                  {stop.city && <p className={`mt-1 text-sm ${mutedClass}`}>{stop.city}</p>}
                </div>
                <button
                  onClick={onClose}
                  className={`w-9 h-9 flex items-center justify-center border rounded-full transition flex-shrink-0 ${
                    isLight ? 'bg-slate-100 border-slate-200 hover:bg-slate-200' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                  }`}
                  aria-label="close"
                >
                  <XMarkIcon className={`w-4 h-4 ${titleClass}`} />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 pb-4 pt-4 flex-1 overflow-y-auto">
                {atCap && (
                  <div className={`mb-4 rounded-2xl border p-3 ${isLight ? 'border-amber-200 bg-amber-50' : 'border-amber-700/50 bg-amber-950/50'}`}>
                    <p className={`text-sm ${isLight ? 'text-amber-700' : 'text-amber-200'}`}>{text.capReached}</p>
                  </div>
                )}

                <div className="mb-3 flex items-baseline justify-between">
                  <p className={`signal-label ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {text.subtitle}
                  </p>
                  {mode === 'pick' && picked.size > 0 && (
                    <p className={`tabular text-xs ${mutedClass}`}>{text.countSelected(picked.size)}</p>
                  )}
                </div>

                {/* Sélecteur à deux positions : « toutes » ou une sélection. */}
                <div
                  role="tablist"
                  className={`mb-3 grid grid-cols-2 gap-1 rounded-2xl border p-1 ${panelClass}`}
                >
                  {(['all', 'pick'] as const).map(value => (
                    <button
                      key={value}
                      role="tab"
                      aria-selected={mode === value}
                      onClick={() => setMode(value)}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                        mode === value
                          ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                          : isLight
                            ? 'text-slate-600 hover:bg-slate-100'
                            : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {value === 'all' ? text.allLines : text.pick}
                    </button>
                  ))}
                </div>

                <p className={`mb-4 text-xs leading-relaxed ${mutedClass}`}>
                  {mode === 'all' ? text.allHint : text.pickHint}
                </p>

                {/* Les lignes elles-mêmes sont l'interface : une grille de
                    plaques aux couleurs officielles, plus rapide à parcourir
                    qu'une liste et fidèle à ce qu'on lit sur le quai. */}
                {sortedLines.length === 0 ? (
                  <p className={`py-6 text-center text-sm ${mutedClass}`}>{text.noLines}</p>
                ) : (
                  <div className="mb-2 grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
                    {sortedLines.map(line => {
                      const id = line.id;
                      const isPicked = mode === 'pick' && picked.has(id);
                      const dimmed = mode === 'all';
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            if (mode === 'all') setMode('pick');
                            togglePick(id);
                          }}
                          aria-pressed={isPicked}
                          title={line.name || line.shortName || line.id}
                          className={`relative flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 transition ${
                            isPicked
                              ? 'border-blue-500/70 bg-blue-500/10'
                              : dimmed
                                ? (isLight ? 'border-slate-200 bg-slate-50 opacity-50' : 'border-slate-800 bg-slate-900/60 opacity-50')
                                : (isLight ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-slate-800 bg-slate-900 hover:bg-slate-800/80')
                          }`}
                        >
                          <LineBadge line={line} />
                          <span
                            className={`w-full text-center text-[11px] leading-snug ${mutedClass}`}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {line.name || line.shortName || line.id}
                          </span>
                          {isPicked && (
                            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                              <CheckIcon className="h-3 w-3 text-white" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={`flex gap-2 px-5 py-4 border-t flex-shrink-0 ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800/80 bg-slate-950/95'}`}>
                <button
                  onClick={onClose}
                  className={`flex-1 px-4 py-3 text-sm font-semibold rounded-2xl transition ${
                    isLight
                      ? 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
                      : 'bg-slate-900 border border-slate-700 text-white hover:bg-slate-800'
                  }`}
                >
                  {text.cancel}
                </button>
                <button
                  onClick={handleSave}
                  disabled={atCap || (mode === 'pick' && picked.size === 0)}
                  className="flex-[1.6] rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {text.save}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
