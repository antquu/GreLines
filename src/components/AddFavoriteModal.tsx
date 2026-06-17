import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, StarIcon, CheckIcon } from '@heroicons/react/24/solid';
import { useState, useEffect } from 'react';
import type { StopDetail } from '../types';
import { resolveLineBackgroundColor, resolveLineTextColor } from '../utils/lineColors';
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
}

function getText(language: 'fr' | 'en') {
  return {
    title: language === 'fr' ? 'Ajouter aux favoris' : 'Add to favorites',
    subtitle:
      language === 'fr' ? 'Quelles lignes veux-tu suivre ?' : 'Which lines do you want to track?',
    allLines: language === 'fr' ? 'Toutes les lignes' : 'All lines',
    allLinesDesc: language === 'fr' ? 'Suit chaque ligne qui dessert l’arrêt' : 'Track every line that serves the stop',
    pick: language === 'fr' ? 'Sélectionner' : 'Pick lines',
    cancel: language === 'fr' ? 'Annuler' : 'Cancel',
    save: language === 'fr' ? 'Enregistrer' : 'Save',
    capReached:
      language === 'fr'
        ? `Limite atteinte (${FAVORITES_MAX} favoris max)`
        : `Cap reached (${FAVORITES_MAX} favorites max)`,
    noLines: language === 'fr' ? 'Aucune ligne pour cet arrêt' : 'No lines for this stop',
    selected: language === 'fr' ? 'sélectionnée(s)' : 'selected',
  };
}

interface MinimalLine {
  id: string;
  shortName?: string;
  name?: string;
  color?: string;
  type?: string;
}

function sortLines(lines: MinimalLine[]): MinimalLine[] {
  function priority(l: MinimalLine) {
    const n = (l.shortName || l.id).toUpperCase();
    if (n === 'A' || n === 'B' || n === 'C' || n === 'D' || n === 'E') return 0;
    if (/^C\d+$/.test(n)) return 1;
    return 2;
  }
  return [...lines].sort((a, b) => {
    const dp = priority(a) - priority(b);
    if (dp !== 0) return dp;
    return (a.shortName || a.id).localeCompare(b.shortName || b.id, undefined, {
      numeric: true,
    });
  });
}

/**
 * Returns whether the line should be drawn as a circular badge (tram + chrono)
 * or a rounded rectangle (everything else). Matches the existing visual logic
 * in Sidebar.tsx.
 */
function isRoundLine(label: string): boolean {
  const n = label.toUpperCase().trim();
  if (n === 'A' || n === 'B' || n === 'C' || n === 'D' || n === 'E') return true;
  return /^C\d+$/.test(n);
}


/**
 * A line badge that mirrors the look of badges elsewhere in the app: round for
 * tram and chrono lines, rectangle for the rest, in the line's official color.
 */
function LineBadge({ line, size = 'md' }: { line: MinimalLine; size?: 'sm' | 'md' }) {
  const label = line.shortName || line.id;
  const round = isRoundLine(label);
  const raw = line.color || null;
  const bg = resolveLineBackgroundColor(raw, line.shortName || line.id);
  const fg = resolveLineTextColor(raw, line.shortName || line.id);
  const dim = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-11 h-11 text-sm';
  return (
    <div
      className={`${dim} flex items-center justify-center font-extrabold flex-shrink-0 ${
        round ? 'rounded-full' : 'rounded-lg'
      }`}
      style={{ backgroundColor: bg, color: fg }}
    >
      {label}
    </div>
  );
}

export function AddFavoriteModal(props: AddFavoriteModalProps) {
  const { isOpen, onClose, stop, language } = props;
  const text = getText(language);

  const [mode, setMode] = useState<'all' | 'pick'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Hydrate from existing favorite (if editing) when the modal opens.
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
          {/* Backdrop. z-index sits above react-modal-sheet (which uses ~9998
              internally) so the modal floats over the SidebarMobile sheet. */}
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
            <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col pointer-events-auto">
              {/* Header */}
              <div className="flex items-start justify-between px-5 pt-5 pb-3 flex-shrink-0">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                      <StarIcon className="w-4 h-4 text-amber-400" />
                    </div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {text.title}
                    </span>
                  </div>
                  <h2 className="text-xl font-extrabold text-white leading-tight">{stop.name}</h2>
                  {stop.city && <p className="text-xs text-slate-400 mt-0.5">{stop.city}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full hover:bg-slate-700 transition flex-shrink-0"
                  aria-label="close"
                >
                  <XMarkIcon className="w-4 h-4 text-white" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 pb-3 flex-1 overflow-y-auto">
                {atCap && (
                  <div className="bg-amber-950 border border-amber-700 rounded-2xl p-3 mb-4">
                    <p className="text-sm text-amber-300">{text.capReached}</p>
                  </div>
                )}

                <p className="text-sm text-slate-300 mb-4">{text.subtitle}</p>

                {/* "All lines" big card */}
                <button
                  onClick={() => setMode('all')}
                  className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition mb-3 ${
                    mode === 'all'
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-slate-800 border-slate-700 hover:bg-slate-750'
                  }`}
                >
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                    mode === 'all' ? 'bg-blue-500' : 'bg-slate-700'
                  }`}>
                    {mode === 'all' ? (
                      <CheckIcon className="w-5 h-5 text-white" />
                    ) : (
                      <span className="text-slate-400 font-bold text-lg">✓</span>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold text-white">{text.allLines}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{text.allLinesDesc}</p>
                  </div>
                </button>

                {/* Section header for picker */}
                <div className="flex items-center justify-between mb-2 mt-2 px-1">
                  <button
                    onClick={() => setMode(mode === 'pick' ? 'all' : 'pick')}
                    className="text-xs font-semibold text-slate-400 uppercase tracking-wider"
                  >
                    {text.pick}
                  </button>
                  {mode === 'pick' && picked.size > 0 && (
                    <span className="text-xs text-slate-500">
                      {picked.size} {text.selected}
                    </span>
                  )}
                </div>

                {/* Per-line picker — visible always so the user can toggle freely */}
                <div className="space-y-2 mb-2">
                  {sortedLines.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">{text.noLines}</p>
                  ) : (
                    sortedLines.map(line => {
                      const id = line.id;
                      const isPicked = mode === 'pick' && picked.has(id);
                      const dimmed = mode === 'all';
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            // Tapping a line implicitly switches to "pick" mode.
                            if (mode === 'all') setMode('pick');
                            togglePick(id);
                          }}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition text-left ${
                            isPicked
                              ? 'bg-slate-700 border-slate-600'
                              : dimmed
                              ? 'bg-slate-800/50 border-slate-700/60 opacity-70'
                              : 'bg-slate-800 border-slate-700 hover:bg-slate-750'
                          }`}
                        >
                          <LineBadge line={line} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {line.shortName || line.id}
                            </p>
                            {line.name && (
                              <p className="text-xs text-slate-400 truncate mt-0.5">{line.name}</p>
                            )}
                          </div>
                          {isPicked && (
                            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                              <CheckIcon className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-2 px-5 py-4 border-t border-slate-800 flex-shrink-0">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition"
                >
                  {text.cancel}
                </button>
                <button
                  onClick={handleSave}
                  disabled={atCap || (mode === 'pick' && picked.size === 0)}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
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