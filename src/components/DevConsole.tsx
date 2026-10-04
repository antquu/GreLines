import { useEffect, useMemo, useRef, useState } from 'react';
import { usePerfSettings, type PerfSettings } from '../hooks/usePerfSettings';
import { emitDevCommand } from '../utils/devCommands';
import { IS_NANCY } from '../site';
import { clearOptedOutPopups } from '../utils/optedOutPopups';
import { isSimulatedOffline, setSimulatedOffline } from '../services/networkSimulation';
import { isOffline } from '../services/offlineSchedule';
import { restartNetworkScheduleDownload } from '../services/networkSchedules';
import { precacheOfflineMap } from '../services/offlineMap';
import { idbCountPrefix } from '../services/persistentCache';
import { resetAllCaches } from '../utils/resetCaches';
import { DEFAULT_NETWORK_CODES, NETWORKS } from '../services/api';
import { clearRequestLog, getRequestLog, installRequestLog } from '../services/requestLog';
import { isImageLoadingForced, setImageLoadingForced } from '../utils/forcedImageLoading';
import { armLocationPick, resetFakeLocation } from '../utils/devLocation';

installRequestLog();


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
  run: (args: string[], context: ConsoleContext) => Output | Promise<Output>;
  complete?: (done: string[], context: ConsoleContext) => Suggestion[];
}

interface Suggestion {
  value: string;
  detail?: string;
}

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

function parseNetworkCodes(args: string[]): { known: string[]; unknown: string[] } {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const arg of args) {
    const network = NETWORKS.find(entry => entry.code.toLowerCase() === arg.toLowerCase());
    if (network) known.push(network.code);
    else unknown.push(arg);
  }
  return { known, unknown };
}

function networkSuggestions(active: boolean) {
  return (done: string[], { settings }: ConsoleContext): Suggestion[] => {
    const written = new Set(done.map(code => code.toUpperCase()));
    return NETWORKS
      .filter(network => settings.networks.includes(network.code) === active && !written.has(network.code.toUpperCase()))
      .map(network => ({ value: network.code, detail: network.label }));
  };
}

const ON_OFF: Suggestion[] = [{ value: 'on' }, { value: 'off' }];

function settingToggle(name: string, key: BooleanSetting, description: string, invert = false): ConsoleCommand {
  return {
    name,
    usage: '[on|off]',
    description,
    complete: done => (done.length === 0 ? ON_OFF : []),
    run: (args, { settings, setSetting }) => {
      const current = invert ? !settings[key] : settings[key];
      const next = toggle(args[0], current);
      if (next === null) return `Invalid value "${args[0]}". Use on or off.`;
      setSetting(key, invert ? !next : next);
      return `${name}: ${next ? 'on' : 'off'}`;
    },
  };
}

const isMobileView = () => window.innerWidth < 1024;

function showOnMobile(name: string, description: string): ConsoleCommand {
  return {
    name,
    description,
    run: () => {
      if (!isMobileView()) {
        return `${name} only works in mobile view (under 1024 px wide). Open DevTools (F12) and turn on device mode.`;
      }
      emitDevCommand(name);
      return undefined;
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

  showOnMobile('show.onboarding', 'Replay the first-launch onboarding (mobile view only)'),
  showOnMobile('show.notifications', 'Show the "turn on notifications" prompt (mobile view only)'),
  showOnMobile('show.install', 'Show the "add to home screen" guide (mobile view only)'),
  {
    name: 'show.teststop',
    description: 'Open a frozen test stop (Chavant) with a draggable panel to replay departure animations',
    run: () => {
      emitDevCommand('show.teststop');
      return 'Test stop opened. Drag the DEPARTURE LAB panel by its title.';
    },
  },
  ...(IS_NANCY ? [{
    name: 'show.outside',
    description: 'Show the "not in Nancy" prompt, even after "Stay on GreLines Nancy"',
    run: () => {
      emitDevCommand('show.outside');
      return 'Outside-area prompt shown.';
    },
  }] : [{
    name: 'show.unserved',
    description: 'Show the "area not covered yet" prompt',
    run: () => {
      emitDevCommand('show.unserved');
      return 'Unserved-area prompt shown.';
    },
  }]),
  {
    name: 'show.popup',
    usage: '[infotraffic|promo]',
    description: 'Show a test popup (traffic info by default)',
    complete: done => (done.length === 0 ? [{ value: 'infotraffic' }, { value: 'promo' }] : []),
    run: args => {
      const kind = args[0] === 'promo' ? 'promo' : 'infotraffic';
      emitDevCommand('show.popup', [kind]);
      return `Popup shown: ${kind}`;
    },
  },
  {
    name: 'popup.reset',
    description: 'Show again the announcements hidden with "Don’t show this again"',
    run: () => {
      const count = clearOptedOutPopups();
      emitDevCommand('popup.reset');
      return count === 0
        ? 'No hidden announcement. Active ones reloaded.'
        : `${count} hidden announcement${count > 1 ? 's' : ''} restored.`;
    },
  },
  {
    name: 'bypass.onboarding',
    description: 'Close the onboarding and mark it as done',
    run: () => { emitDevCommand('bypass.onboarding'); return 'Onboarding closed.'; },
  },
  {
    name: 'bypass.notifications',
    description: 'Close the notifications prompt and mark it as answered',
    run: () => { emitDevCommand('bypass.notifications'); return 'Notifications prompt closed.'; },
  },
  {
    name: 'bypass.install',
    description: 'Close the "add to home screen" guide',
    run: () => { emitDevCommand('bypass.install'); return 'Install guide closed.'; },
  },
  {
    name: 'bypass.popup',
    description: 'Close every popup on screen',
    run: () => { emitDevCommand('bypass.popup'); return 'Popups closed.'; },
  },
  {
    name: 'bypass.all',
    description: 'Close every launch screen and popup at once (offline screen included)',
    run: () => {
      for (const name of ['bypassWIFI.popup', 'bypass.onboarding', 'bypass.notifications', 'bypass.install', 'bypass.popup']) {
        emitDevCommand(name);
      }
      return 'Everything closed.';
    },
  },
  {
    name: 'bypassWIFI.popup',
    description: 'Dismiss the "You are offline" launch screen',
    run: () => { emitDevCommand('bypassWIFI.popup'); },
  },

  settingToggle('devOverlay', 'devOverlay', 'Show the FPS and performance overlay'),
  settingToggle('net.overlay', 'netOverlay', 'Raw live list of every network request, top right'),
  {
    name: 'location.pick',
    description: 'Close the console; the next tap or right-click on the map becomes your location',
    run: () => { armLocationPick(); },
  },
  {
    name: 'location.reset',
    description: 'Forget the picked location and go back to the real one',
    run: () => { resetFakeLocation(); return 'Location reset to the real one.'; },
  },
  {
    name: 'images.loading',
    usage: '[on|off]',
    description: 'Keep place images in their loading state (shimmer)',
    complete: done => (done.length === 0 ? ON_OFF : []),
    run: args => {
      const next = toggle(args[0], isImageLoadingForced());
      if (next === null) return `Invalid value "${args[0]}". Use on or off.`;
      setImageLoadingForced(next);
      return `images.loading: ${next ? 'on' : 'off'}`;
    },
  },
  {
    name: 'notify.test',
    usage: '[location|card]',
    description: 'Show a test notification at the top of the screen',
    complete: done => (done.length === 0 ? [{ value: 'location' }, { value: 'card' }] : []),
    run: args => { emitDevCommand('notify.test', [args[0] ?? 'card']); },
  },
  {
    name: 'net.clear',
    description: 'Empty the network overlay and reset its counter',
    run: () => { clearRequestLog(); return 'Network log cleared.'; },
  },
  {
    name: 'net.count',
    description: 'How many requests were made since the app started',
    run: () => {
      const { entries, total } = getRequestLog();
      const failed = entries.filter(entry => entry.status === 0 || (entry.status ?? 0) >= 400).length;
      return `Requests: ${total} (${failed} failed in the last ${entries.length})`;
    },
  },
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
  {
    name: 'networks.list',
    description: 'List every available network, with its code and state',
    run: (_args, { settings }) => NETWORKS.map(network =>
      `${settings.networks.includes(network.code) ? '[x]' : '[ ]'} ${network.code.padEnd(11)} ${network.label}`),
  },
  {
    name: 'networks.select',
    usage: '<code> [code…]',
    description: 'Turn one or more networks on (see networks.list)',
    complete: networkSuggestions(false),
    run: (args, { settings, setSetting }) => {
      if (args.length === 0) return 'Missing network code. Example: networks.select STAS';
      const { known, unknown } = parseNetworkCodes(args);
      if (known.length > 0) setSetting('networks', [...new Set([...settings.networks, ...known])]);
      return [
        ...(known.length ? [`On: ${known.join(', ')}`] : []),
        ...(unknown.length ? [`Unknown network: ${unknown.join(', ')}. Type networks.list.`] : []),
      ];
    },
  },
  {
    name: 'networks.deselect',
    usage: '<code> [code…]',
    description: 'Turn one or more networks off (see networks.list)',
    complete: networkSuggestions(true),
    run: (args, { settings, setSetting }) => {
      if (args.length === 0) return 'Missing network code. Example: networks.deselect STAS';
      const { known, unknown } = parseNetworkCodes(args);
      const next = settings.networks.filter(code => !known.includes(code));
      if (known.length > 0) setSetting('networks', next.length > 0 ? next : DEFAULT_NETWORK_CODES);
      return [
        ...(known.length ? [`Off: ${known.join(', ')}`] : []),
        ...(next.length === 0 ? ['No network left: Tag (SEM, SE2) kept on.'] : []),
        ...(unknown.length ? [`Unknown network: ${unknown.join(', ')}. Type networks.list.`] : []),
      ];
    },
  },

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
    complete: done => (done.length === 0 ? [{ value: 'confirm' }] : []),
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

const BAND = 'rgba(20, 20, 20, 0.62)';
const PANEL = 'rgba(20, 20, 20, 0.78)';
const SELECTED = 'rgba(255, 255, 255, 0.12)';
const TEXT = '#ffffff';
const MUTED = '#9ca3af';
const ERROR = '#f87171';

const OPEN_KEY = '²';
const OPEN_PRESSES = 6;
const PRESS_GAP_MS = 2000;
const MAX_OUTPUT_LINES = 200;
const HISTORY_KEY = 'greLines_devConsoleHistory_v1';
const MAX_HISTORY = 50;

function readHistory(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(entry => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function writeHistory(history: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
  }
}

export function DevConsole() {
  const { settings, setSetting, resetSettings } = usePerfSettings();
  const enabled = settings.devMode;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState(0);
  const [output, setOutput] = useState<Array<{ text: string; error?: boolean }>>([]);
  const [history, setHistory] = useState<string[]>(readHistory);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const pickedWithArrowsRef = useRef(false);

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
  const typingName = typed.length > 0 && !/\s/.test(value.trimStart());
  const browsingHistory = historyIndex >= 0;
  const matches = useMemo(() => {
    if (!typingName || browsingHistory) return [];
    const needle = typed.toLowerCase();
    return COMMANDS
      .filter(command => command.name.toLowerCase().includes(needle))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(needle)) - Number(!b.name.toLowerCase().startsWith(needle)));
  }, [typed, typingName, browsingHistory]);

  const argumentMatches = useMemo((): Suggestion[] => {
    if (typingName || browsingHistory || !/\s/.test(value.trimStart())) return [];
    const command = COMMANDS.find(entry => entry.name.toLowerCase() === typed.toLowerCase());
    if (!command?.complete) return [];
    const words = value.trimStart().split(/\s+/).slice(1);
    const needle = (words.pop() ?? '').toLowerCase();
    return command.complete(words, { settings, setSetting, resetSettings })
      .filter(entry => entry.value.toLowerCase() !== needle)
      .filter(entry => entry.value.toLowerCase().includes(needle) || (entry.detail ?? '').toLowerCase().includes(needle))
      .sort((a, b) => Number(!a.value.toLowerCase().startsWith(needle)) - Number(!b.value.toLowerCase().startsWith(needle)));
  }, [value, typed, typingName, browsingHistory, settings, setSetting, resetSettings]);

  useEffect(() => {
    const panel = outputRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [output, open]);

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
    const command = exact ?? matches[selected];
    setHistory(previous => {
      const next = [line, ...previous.filter(entry => entry !== line)].slice(0, MAX_HISTORY);
      writeHistory(next);
      return next;
    });
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

  const acceptArgument = (suggestion: Suggestion) => {
    setValue(`${value.replace(/\S*$/, '')}${suggestion.value} `);
    setSelected(0);
    pickedWithArrowsRef.current = false;
  };

  const suggestionCount = matches.length > 0 ? matches.length : argumentMatches.length;

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
      const typingWord = /\S$/.test(value);
      if ((typingWord || pickedWithArrowsRef.current) && argumentMatches.length > 0) {
        acceptArgument(argumentMatches[selected] ?? argumentMatches[0]);
      }
      else void run();
    } else if (event.key === 'Tab' && matches.length > 0) {
      event.preventDefault();
      setValue(`${(matches[selected] ?? matches[0]).name} `);
      setSelected(0);
    } else if (event.key === 'Tab' && argumentMatches.length > 0) {
      event.preventDefault();
      acceptArgument(argumentMatches[selected] ?? argumentMatches[0]);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (suggestionCount > 0) { pickedWithArrowsRef.current = true; setSelected(index => (index + 1) % suggestionCount); }
      else if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1);
        setValue(history[historyIndex - 1]);
      } else {
        setHistoryIndex(-1);
        setValue('');
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (suggestionCount > 0) { pickedWithArrowsRef.current = true; setSelected(index => (index - 1 + suggestionCount) % suggestionCount); }
      else if (historyIndex + 1 < history.length) {
        setHistoryIndex(historyIndex + 1);
        setValue(history[historyIndex + 1]);
      }
    }
  };

  const showSuggestions = matches.length > 0;
  const showArguments = !showSuggestions && argumentMatches.length > 0;
  const showOutput = !showSuggestions && !showArguments && output.length > 0;
  const keepInView = (active: boolean) =>
    active ? (element: HTMLDivElement | null) => element?.scrollIntoView({ block: 'nearest' }) : undefined;

  return (
    <div
      className="fixed inset-x-0 top-1/2 z-[10300] -translate-y-1/2"
      role="dialog"
      aria-label="Developer console"
    >
      {(showSuggestions || showArguments || showOutput) && (
        <div
          ref={outputRef}
          className="absolute inset-x-0 bottom-full max-h-[40vh] overflow-y-auto py-1 font-mono text-[0.8125rem]"
          style={{ backgroundColor: PANEL }}
          role={showSuggestions || showArguments ? 'listbox' : 'log'}
        >
          {showArguments
            ? argumentMatches.map((suggestion, index) => (
              <div
                key={suggestion.value}
                ref={keepInView(index === selected)}
                role="option"
                aria-selected={index === selected}
                onMouseDown={event => {
                  event.preventDefault();
                  acceptArgument(suggestion);
                  inputRef.current?.focus();
                }}
                className="flex cursor-pointer items-baseline gap-4 px-3 py-1"
                style={{ backgroundColor: index === selected ? SELECTED : 'transparent' }}
              >
                <span className="min-w-[7rem]" style={{ color: TEXT }}>{suggestion.value}</span>
                {suggestion.detail && <span style={{ color: MUTED }}>{suggestion.detail}</span>}
              </div>
            ))
            : showSuggestions
            ? matches.map((command, index) => (
              <div
                key={command.name}
                ref={keepInView(index === selected)}
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
            pickedWithArrowsRef.current = false;
          }}
          onKeyDown={onKeyDown}
          onBlur={() => inputRef.current?.focus()}
          spellCheck={false}
          autoComplete="off"
          placeholder="Enter command here. Syntax: command argument1 argument2"
          aria-label="Command"
          className="block h-9 w-full border-0 bg-transparent px-1 text-[1.0625rem] outline-none placeholder:text-[#9ca3af]"
          style={{ color: TEXT }}
        />
      </div>
    </div>
  );
}
