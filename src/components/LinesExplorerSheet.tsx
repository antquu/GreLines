import { XMarkIcon } from '@heroicons/react/24/solid';
import { IS_NANCY } from '../site';
import { MapSheet } from './MapSheet';
import { LineBadge } from './LineBadge';
import type { AllLinesLine } from '../services/allLines';
import { tx } from '../i18n';

interface LinesExplorerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lines: AllLinesLine[];
  onLineClick: (line: AllLinesLine) => void;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
}

const GRENOBLE_GROUPS: { key: string; label: string; networks: string[] }[] = [
  { key: 'mtag',   label: 'M Tag',        networks: ['SEM', 'SE2'] },
  { key: 'tougo',  label: 'Tougo',        networks: ['TPV'] },
  { key: 'reso',   label: 'Réso',         networks: ['GSV'] },
  { key: 'cars',   label: 'Cars Région',  networks: ['C38'] },
];

const NETWORK_GROUPS: { key: string; label: string; networks: string[] }[] = IS_NANCY
  ? [{ key: 'stan', label: 'Stan', networks: ['STAN'] }]
  : GRENOBLE_GROUPS;

const OTHERS_GROUP_KEY = 'other';

function networkOf(id: string): string {
  return id.split(':')[0].toUpperCase().trim();
}

function sortLines(lines: AllLinesLine[]): AllLinesLine[] {
  const priority = (l: AllLinesLine) => {
    const n = (l.shortName || l.id).toUpperCase();
    if (IS_NANCY) {
      if (/^T\d$/.test(n)) return 0;
      if (n === 'COROL') return 1;
      if (/^CIT\d$/.test(n)) return 2;
      if (/^\d+E?$/.test(n)) return 3;
      return 4;
    }
    if (['A', 'B', 'C', 'D', 'E'].includes(n)) return 0;
    if (/^C\d+$/.test(n)) return 1;
    return 2;
  };
  return [...lines].sort((a, b) => {
    const dp = priority(a) - priority(b);
    if (dp !== 0) return dp;
    return (a.shortName || a.id).localeCompare(b.shortName || b.id, undefined, { numeric: true });
  });
}

function groupLines(lines: AllLinesLine[], language: 'fr' | 'en') {
  const known = new Set(NETWORK_GROUPS.flatMap(g => g.networks));
  const sections = NETWORK_GROUPS.map(group => ({
    key: group.key,
    label: group.label,
    lines: sortLines(lines.filter(l => group.networks.includes(networkOf(l.id)))),
  }));
  const others = sortLines(lines.filter(l => !known.has(networkOf(l.id))));
  if (others.length > 0) {
    sections.push({ key: OTHERS_GROUP_KEY, label: tx(language === 'fr').linesExplorerSheet.othersGroup, lines: others });
  }
  return sections.filter(s => s.lines.length > 0);
}

export const LinesExplorerSheet = ({
  isOpen,
  onClose,
  lines,
  onLineClick,
  language,
  theme = 'dark',
}: LinesExplorerSheetProps) => {
  const isLight = theme === 'light';
  const sections = groupLines(lines, language);
  const title = tx(language === 'fr').linesExplorerSheet.exploreLines;

  return (
    <MapSheet initialSnap={3} isOpen={isOpen} onClose={onClose} isLight={isLight} zIndex={100}>
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
            <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{title}</h3>
            <button
              onClick={onClose}
              className={`w-9 h-9 flex items-center justify-center rounded-full border transition ${
                isLight
                  ? 'bg-white border-slate-200 hover:bg-slate-100'
                  : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <XMarkIcon className={`w-4 h-4 ${isLight ? 'text-slate-700' : 'text-white'}`} />
            </button>
          </div>

          <div
            className="overflow-y-auto flex-1 px-5"
            style={{ paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))' }}
          >
            {sections.map(section => (
              <div key={section.key} className="mb-5">
                <h4 className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wider ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  {section.label}
                </h4>
                <div className="grid grid-cols-4 gap-2.5">
                  {section.lines.map(line => (
                    <button
                      key={line.id}
                      onClick={() => onLineClick(line)}
                      className={`flex min-h-[56px] items-center justify-center overflow-hidden rounded-2xl px-1.5 py-3 transition active:scale-95 ${
                        isLight
                          ? 'bg-white border border-slate-200 shadow-[0_8px_20px_rgba(148,163,184,0.16)]'
                          : 'bg-slate-800 border border-slate-700'
                      }`}
                    >
                      <LineBadge line={line} size="md" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
    </MapSheet>
  );
};
