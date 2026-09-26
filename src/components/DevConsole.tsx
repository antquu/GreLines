import { useEffect, useMemo, useRef, useState } from 'react';
import { usePerfSettings, type PerfSettings } from '../hooks/usePerfSettings';
import { emitDevCommand } from '../utils/devCommands';
import { isSimulatedOffline, setSimulatedOffline } from '../services/networkSimulation';
import { isOffline } from '../services/offlineSchedule';
import { restartNetworkScheduleDownload } from '../services/networkSchedules';
import { precacheOfflineMap } from '../services/offlineMap';
import { idbCountPrefix } from '../services/persistentCache';
import { resetAllCaches } from '../utils/resetCaches';

/**
 * La console développeur.
 *
 * Six appuis sur « ² » l'ouvrent, en mode développeur seulement : une bande
 * grise translucide traverse l'écran à mi-hauteur, comme la console d'un jeu.
 * On y tape une commande ; au-dessus, une seconde bande propose celles qui
 * correspondent, ou affiche la réponse de la dernière. Rien ne s'anime :
 * c'est un outil, il doit répondre tout de suite.
 *
 * Elle est en anglais, volontairement : c'est un outil de développement,
 * pas une partie de l'interface, et les commandes se tapent telles quelles.
 *
 * Entrée lance, Tab complète, les flèches parcourent les propositions (ou
 * l'historique quand rien n'est proposé), Échap referme.
 */

type Output = string | string[] | void;

interface ConsoleContext {
  settings: PerfSettings;
  setSetting: <K extends keyof PerfSettings>(key: K, value: PerfSettings[K]) => void;
  resetSettings: () => void;
}

interface ConsoleCommand {
  name: string;
  usage?: string;
  description: string;
  /** Rend ce qu'il faut afficher. Rien : la console se referme. */
  run: (args: string[], context: ConsoleContext) => Output | Promise<Output>;
}

/** « on », « off », ou rien pour basculer. */
function toggle(arg: string | undefined, current: boolean): boolean | null {
  if (arg === undefined) return !current;
  const value = arg.toLowerCase();
  if (['on', 'true', '1', 'yes'].includes(value)) return true;
  if (['off', 'false', '0', 'no'].includes(value)) return false;
  return null;
}

type BooleanSetting = {
  [K in keyof PerfSettings]: PerfSettings[K] extends boolean ? K : never
}[keyof PerfSettings];

/** Une commande qui bascule un réglage. `invert` quand le réglage dit l'inverse du nom. */
function settingToggle(name: string, key: BooleanSetting, description: string, invert = false): ConsoleCommand {
  return {
    name,
    usage: '[on|off]',
    description,
    run: (args, { settings, setSetting }) => {
      const current = invert ? !settings[key] : settings[key];
      const next = toggle(args[0], current);
      if (next === null) return `Invalid value "${args[0]}". Use on or off.`;
      setSetting(key, invert ? !next : next);
      return `${name}: ${next ? 'on' : 'off'}`;
    },
  };
}

const COMMANDS: ConsoleCommand[] = [
  {
    name: 'help',
    description: 'List every command',
    run: () => COMMANDS.map(command =>
      `${command.name}${command.usage ? ` ${command.usage}` : ''}  —  ${command.description}`),
  },
  { name: 'clear', description: 'Clear the console output', run: () => [] },
  { name: 'close', description: 'Close the console', run: () => undefined },

  {
    name: 'bypassWIFI.popup',
    description: 'Dismiss the "You are offline" launch screen',
    run: () => { emitDevCommand('bypassWIFI.popup'); },
  },

  settingToggle('devOverlay', 'devOverlay', 'Show the FPS and performance overlay'),
  settingToggle('render.stopBadges', 'stopLineBadges', 'Line badges next to stops'),
  settingToggle('render.stopLabels', 'stopLabels', 'Stop names on the map'),
  settingToggle('render.lineShapes', 'lineShapes', 'Line shapes on the map'),
  {
    name: 'render.markerCap',
    usage: '<n|0>',
    description: 'Cap the number of stop markers (0 = unlimited)',
    run: (args, { settings, setSetting }) => {
      if (args[0] === undefined) return `render.markerCap: ${settings.markerCap || 'unlimited'}`;
      const value = Number(args[0]);
      if (!Number.isInteger(value) || value < 0) return `Invalid value "${args[0]}". Use a whole number.`;
      setSetting('markerCap', value);
      return `render.markerCap: ${value || 'unlimited'}`;
    },
  },
  settingToggle('fx.animations', 'animations', 'Interface animations'),
  settingToggle('fx.blur', 'blurEffects', 'Blur effects'),
  settingToggle('fx.shadows', 'shadows', 'Shadows'),
  settingToggle('ui.footerTicker', 'hideFooterTicker', 'Traffic ticker in the footer', true),
  settingToggle('a11y', 'accessibility', 'Accessibility mode'),
  settingToggle('mobility.citiz', 'citiz', 'Citiz cars on the map'),
  settingToggle('mobility.voi', 'voi', 'Voi vehicles on the map'),
  {
    name: 'settings.reset',
    description: 'Restore every setting to its default',
    run: (_args, { resetSettings }) => {
      resetSettings();
      return 'Settings reset to defaults.';
    },
  },

  {
    name: 'network.off',
    description: 'Simulate a lost connection',
    run: () => { setSimulatedOffline(true); return 'Network: off (simulated)'; },
  },
  {
    name: 'network.on',
    description: 'Restore the connection',
    run: () => { setSimulatedOffline(false); return 'Network: on'; },
  },
  {
    name: 'network.status',
    description: 'Show the connection state',
    run: () => [
      `Browser online: ${navigator.onLine ? 'yes' : 'no'}`,
      `Simulated cut: ${isSimulatedOffline() ? 'yes' : 'no'}`,
      `App considers itself: ${isOffline() ? 'offline' : 'online'}`,
    ],
  },

  {
    name: 'offline.status',
    description: 'What is saved on this device for offline use',
    run: async () => {
      const [stops, timetables, geometries, servedStops] = await Promise.all([
        idbCountPrefix('offsched_v1_'),
        idbCountPrefix('timetable_offline_v1_'),
        idbCountPrefix('lineGeometry_v2_'),
        idbCountPrefix('servedStops_v2_'),
      ]);
      let lines = 0;
      try {
        lines = Object.keys(JSON.parse(localStorage.getItem('greLines_offlineLines_v4') || '{}')).length;
      } catch {
        lines = 0;
      }
      return [
        `Stop schedules: ${stops}`,
        `Line timetables: ${timetables}`,
        `Line shapes: ${geometries} · served stop lists: ${servedStops}`,
        `Download registry entries: ${lines}`,
      ];
    },
  },
  {
    name: 'offline.redownload',
    description: 'Download every theoretical timetable again',
    run: () => { restartNetworkScheduleDownload(); return 'Timetable download restarted (tram first).'; },
  },
  {
    name: 'offline.map',
    description: 'Download the Grenoble base map tiles again',
    run: () => {
      if (!navigator.serviceWorker?.controller) return 'No active service worker: tiles would not be kept.';
      void precacheOfflineMap({ force: true });
      return 'Base map download started in the background.';
    },
  },

  {
    name: 'storage.usage',
    description: 'Storage used by the app on this device',
    run: async () => {
      if (!navigator.storage?.estimate) return 'Storage estimate unavailable in this browser.';
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
      return `Used ${mb(usage)} of ${mb(quota)}`;
    },
  },
  {
    name: 'cache.reset',
    usage: 'confirm',
    description: 'Wipe every cache and reload (asks for "confirm")',
    run: (args) => {
      if (args[0] !== 'confirm') return 'This wipes all local data. Type: cache.reset confirm';
      void resetAllCaches();
      return 'Wiping caches…';
    },
  },
  {
    name: 'sw.update',
    description: 'Check for a new service worker',
    run: async () => {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (!registration) return 'No service worker registered.';
      await registration.update();
      return 'Service worker update check done.';
    },
  },
  {
    name: 'env.info',
    description: 'Build, viewport and device details',
    run: () => [
      `Mode: ${import.meta.env.MODE}`,
      `Viewport: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
      `Service worker: ${navigator.serviceWorker?.controller ? 'active' : 'none'}`,
      `Language: ${navigator.language}`,
    ],
  },
  { name: 'app.reload', description: 'Reload the app', run: () => { window.location.reload(); } },
];

/* Couleurs posées en style : le thème clair recolore les classes utilitaires. */
const BAND = 'rgba(20, 20, 20, 0.62)';
const PANEL = 'rgba(20, 20, 20, 0.78)';
const SELECTED = 'rgba(255, 255, 255, 0.12)';
const TEXT = '#ffffff';
const MUTED = '#9ca3af';
const ERROR = '#f87171';

const OPEN_KEY = '²';
const OPEN_PRESSES = 6;
const PRESS_GAP_MS = 2000;
const MAX_OUTPUT_LINES = 14;

export function DevConsole() {
  const { settings, setSetting, resetSettings } = usePerfSettings();
  const enabled = settings.devMode;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState(0);
  const [output, setOutput] = useState<Array<{ text: string; error?: boolean }>>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Six appuis qui se suivent ; plus de deux secondes d'écart, on recompte. */
  useEffect(() => {
    if (!enabled || open) return;
    let count = 0;
    let last = 0;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== OPEN_KEY) return;
      const now = Date.now();
      count = now - last > PRESS_GAP_MS ? 1 : count + 1;
      last = now;
      if (count >= OPEN_PRESSES) {
        event.preventDefault();
        setValue('');
        setSelected(0);
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const typed = value.trim().split(/\s+/)[0] ?? '';
  /* Les propositions ne portent que sur le nom : une fois l'espace tapé, on
     écrit des arguments, plus une commande. */
  const typingName = typed.length > 0 && !/\s/.test(value.trimStart());
  const matches = useMemo(() => {
    if (!typingName) return [];
    const needle = typed.toLowerCase();
    return COMMANDS
      .filter(command => command.name.toLowerCase().includes(needle))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(needle)) - Number(!b.name.toLowerCase().startsWith(needle)));
  }, [typed, typingName]);

  if (!enabled || !open) return null;

  const close = () => {
    setOpen(false);
    setValue('');
  };

  const print = (lines: Array<{ text: string; error?: boolean }>) => {
    setOutput(previous => [...previous, ...lines].slice(-MAX_OUTPUT_LINES));
  };

  const run = async () => {
    const line = value.trim();
    const [name, ...args] = line.split(/\s+/);
    if (!name) return;
    const exact = COMMANDS.find(command => command.name.toLowerCase() === name.toLowerCase());
    /* Pas de correspondance exacte : la proposition surlignée tient lieu de
       commande, comme dans une console de jeu. */
    const command = exact ?? matches[selected];
    setHistory(previous => [line, ...previous.filter(entry => entry !== line)].slice(0, 30));
    setHistoryIndex(-1);
    setValue('');
    setSelected(0);

    if (!command) {
      print([{ text: `> ${line}` }, { text: `Unknown command: ${name}. Type help.`, error: true }]);
      return;
    }
    if (command.name === 'clear') {
      setOutput([]);
      return;
    }
    try {
      const result = await command.run(args, { settings, setSetting, resetSettings });
      if (result === undefined) {
        close();
        return;
      }
      const lines = Array.isArray(result) ? result : [result];
      print([{ text: `> ${command.name}${args.length ? ` ${args.join(' ')}` : ''}` }, ...lines.map(text => ({ text }))]);
    } catch (error) {
      print([{ text: `> ${line}` }, { text: `Error: ${String(error)}`, error: true }]);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === OPEN_KEY) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void run();
    } else if (event.key === 'Tab' && matches.length > 0) {
      event.preventDefault();
      setValue(`${(matches[selected] ?? matches[0]).name} `);
      setSelected(0);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (matches.length > 0) setSelected(index => (index + 1) % matches.length);
      else if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1);
        setValue(history[historyIndex - 1]);
      } else {
        setHistoryIndex(-1);
        setValue('');
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (matches.length > 0) setSelected(index => (index - 1 + matches.length) % matches.length);
      else if (historyIndex + 1 < history.length) {
        setHistoryIndex(historyIndex + 1);
        setValue(history[historyIndex + 1]);
      }
    }
  };

  const showSuggestions = matches.length > 0;
  const showOutput = !showSuggestions && output.length > 0;

  return (
    <div
      className="fixed inset-x-0 top-1/2 z-[10300] -translate-y-1/2"
      role="dialog"
      aria-label="Developer console"
    >
      {(showSuggestions || showOutput) && (
        <div
          className="absolute inset-x-0 bottom-full max-h-[40vh] overflow-y-auto py-1 font-mono text-[13px]"
          style={{ backgroundColor: PANEL }}
          role={showSuggestions ? 'listbox' : 'log'}
        >
          {showSuggestions
            ? matches.map((command, index) => (
              <div
                key={command.name}
                role="option"
                aria-selected={index === selected}
                onMouseDown={event => {
                  event.preventDefault();
                  setValue(`${command.name} `);
                  setSelected(index);
                  inputRef.current?.focus();
                }}
                className="flex cursor-pointer items-baseline gap-4 px-3 py-1"
                style={{ backgroundColor: index === selected ? SELECTED : 'transparent' }}
              >
                <span style={{ color: TEXT }}>
                  {command.name}
                  {command.usage && <span style={{ color: MUTED }}> {command.usage}</span>}
                </span>
                <span style={{ color: MUTED }}>{command.description}</span>
              </div>
            ))
            : output.map((line, index) => (
              <div
                key={index}
                className="whitespace-pre-wrap px-3 py-0.5"
                style={{ color: line.error ? ERROR : line.text.startsWith('> ') ? MUTED : TEXT }}
              >
                {line.text}
              </div>
            ))}
        </div>
      )}

      <div style={{ backgroundColor: BAND }}>
        <input
          ref={inputRef}
          value={value}
          onChange={event => {
            setValue(event.target.value);
            setSelected(0);
            setHistoryIndex(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => inputRef.current?.focus()}
          spellCheck={false}
          autoComplete="off"
          placeholder="Enter command here. Syntax: command argument1 argument2"
          aria-label="Command"
          className="block h-9 w-full border-0 bg-transparent px-1 text-[17px] outline-none placeholder:text-[#9ca3af]"
          style={{ color: TEXT }}
        />
      </div>
    </div>
  );
}
