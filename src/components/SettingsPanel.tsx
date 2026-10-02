import { AnimatePresence, motion } from 'framer-motion';
import { MapSheet } from './MapSheet';
import { LegalSheet } from './LegalSheet';
import {
  XMarkIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  PaintBrushIcon,
  CircleStackIcon,
  InformationCircleIcon,
  CommandLineIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  UserCircleIcon,
  ArrowRightIcon,
  MinusIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/solid';
import { FaWheelchair } from 'react-icons/fa';
import { MinimalScreen } from './MinimalScreen';
import { HelpContactScreen } from './HelpContactScreen';
import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { playGenie } from '../utils/genie';
import { appLanguage } from '../utils/appLanguage';
import type React from 'react';
import { setSimulatedOffline } from '../services/networkSimulation';
import { MobileNotificationPrompt } from './MobileNotificationPrompt';
import { usePerfSettings } from '../hooks/usePerfSettings';
import { resetAllCaches } from '../utils/resetCaches';
import {
  NETWORK_TILES,
  OPERATOR_TILES,
  CITY_NETWORKS,
  CITY_TILES,
  LYON_TILE,
  networkAssetUrl,
  SECONDARY_NETWORKS,
  SHARED_TILES,
  toggleNetworkCodes,
} from './networkTiles';
import {
  notificationPermission,
  notificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
} from '../services/tripNotifications';

interface SettingsPanelProps {
  variant?: 'panel' | 'inline';
  isOpen: boolean;
  settingsState: 'closed' | 'peek' | 'open';
  setSettingsState: (s: 'closed' | 'peek' | 'open') => void;
  activeTab: string;
  setActiveTab: (t: string) => void;
  isMobile: boolean;
  language: 'fr' | 'en';
  setLanguage: (l: 'fr' | 'en') => void;

  accountPseudo?: string | null;
  accountAvatar?: string | null;
  onOpenAccount?: () => void;
  theme?: 'light' | 'dark' | 'blue' | 'auto';
  uiTheme?: 'light' | 'dark';
  compactThemes?: boolean;
  setTheme?: (t: 'light' | 'dark' | 'blue' | 'auto') => void;
  fontSize: 'small' | 'normal' | 'large';
  setFontSize: (f: 'small' | 'normal' | 'large') => void;
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;
  refreshInterval: '15s' | '30s' | '1m' | '2m';
  setRefreshInterval: (v: '15s' | '30s' | '1m' | '2m') => void;
  searchHistory: boolean;
  setSearchHistory: (v: boolean) => void;
  autoSync: boolean;
  setAutoSync: (v: boolean) => void;
  autoLocation: boolean;
  atmoFollowMap: boolean;
  setAtmoFollowMap: (value: boolean) => void;
  setAutoLocation: (v: boolean) => void;
  onOpenInstallGuide?: () => void;
  showInstallGuide?: boolean;
  appData: { version: string; credits: Array<{ role: string; name: string; link?: string }> } | null;
  text: any;
  contentRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}

const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
  <motion.button
    onClick={onChange}
    role="switch"
    aria-checked={value}
    whileTap={{ scale: 0.94 }}
    className="w-[51px] h-[31px] rounded-full transition-colors flex-shrink-0 relative shadow-inner"
    style={{ backgroundColor: value ? '#34c759' : '#39393d' }}
  >
    <motion.span
      animate={{ x: value ? 20 : 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 32 }}
      className="absolute top-[2px] left-[2px] w-[27px] h-[27px] bg-white rounded-full shadow-sm"
    />
  </motion.button>
);

const BareSettings = createContext(false);

const SettingsLight = createContext(false);

const Row = ({
  label,
  children,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) => {
  const bare = useContext(BareSettings);
  const isLight = useContext(SettingsLight);
  return (
    <div
      className={`flex items-center justify-between py-3.5 ${bare ? 'px-1' : 'px-4'} ${
        last
          ? ''
          : `border-b ${
              bare
                ? isLight
                  ? 'border-slate-900/10'
                  : 'border-white/5'
                : isLight
                ? 'border-slate-200'
                : 'border-slate-700/60'
            }`
      }`}
    >
      <span className={`text-[0.9375rem] ${isLight ? 'text-slate-900' : 'text-white'}`}>{label}</span>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
};

const Select = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) => {
  const isLight = useContext(SettingsLight);
  return (
  <div className={`inline-flex max-w-[360px] flex-wrap justify-end gap-1 rounded-xl p-1 ${isLight ? 'bg-slate-100' : 'bg-slate-950/70'}`}>
    {options.map(o => (
      <motion.button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        whileTap={{ scale: 0.96 }}
        className={`rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-semibold transition ${
          value === o.value
            ? 'bg-blue-600 text-white shadow-sm'
            : isLight
            ? 'text-slate-700 hover:bg-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
        }`}
        style={value === o.value ? { color: '#ffffff' } : undefined}
      >
        {o.label}
      </motion.button>
    ))}
  </div>
  );
};

const Dropdown = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) => (
  <select
    value={value}
    onChange={event => onChange(event.target.value as T)}
    className="rounded-2xl bg-slate-950/90 border border-slate-700 px-3 py-2 text-sm font-semibold text-white shadow-inner outline-none transition focus:border-blue-500"
  >
    {options.map(option => (
      <option key={option.value} value={option.value} className="bg-slate-950 text-white">
        {option.label}
      </option>
    ))}
  </select>
);

const Group = ({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) => {
  const isLight = useContext(SettingsLight);
  return (
  <div className="mb-6">
    {title && (
      <h4 className={`text-xs font-semibold uppercase tracking-wider px-4 mb-2 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
        {title}
      </h4>
    )}
    <GroupSurface>{children}</GroupSurface>
  </div>
  );
};
const GroupSurface = ({ children }: { children: React.ReactNode }) => {
  const bare = useContext(BareSettings);
  const isLight = useContext(SettingsLight);
  if (bare) return <div>{children}</div>;
  return (
    <div className={`rounded-2xl border overflow-hidden ${isLight ? 'border-slate-200 bg-white shadow-none' : 'border-slate-700 bg-slate-800/90 shadow-[0_12px_30px_rgba(2,6,23,0.22)]'}`}>
      {children}
    </div>
  );
};

function NetworkTiles({
  tiles,
  isActive,
  onToggle,
  hint,
}: {
  tiles: Array<{ asset: string; selectedAsset: string; label: string; key: string }>;
  isActive: (key: string) => boolean;
  onToggle: (key: string) => void;
  hint?: string;
}) {
  const isLight = useContext(SettingsLight);
  return (
    <div className="grid grid-cols-3 gap-3 px-4 py-4 lg:grid-cols-[repeat(auto-fill,150px)] lg:justify-start">
      {tiles.map(tile => {
        const active = isActive(tile.key);
        return (
          <button
            key={tile.key}
            type="button"
            onClick={() => onToggle(tile.key)}
            aria-pressed={active}
            className="flex flex-col items-center gap-2"
          >
            <img
              src={networkAssetUrl(active ? tile.selectedAsset : tile.asset)}
              alt={tile.label}
              loading="lazy"
              className={`w-full rounded-lg transition ${active ? '' : 'opacity-50 grayscale'}`}
            />
            <span className={`text-center text-xs ${active ? `font-semibold ${isLight ? 'text-slate-900' : 'text-white'}` : 'text-slate-400'}`}>
              {tile.label}
            </span>
          </button>
        );
      })}
      {hint && (
        <p className="col-span-full pt-1 text-center text-[0.6875rem] text-slate-500">{hint}</p>
      )}
    </div>
  );
}

const DATA_SOURCES: Array<{ what: { fr: string; en: string }; who: string }> = [
  { what: { fr: 'Grenoble et l’Isère', en: 'Grenoble and Isère' }, who: 'Mobilités M (API MTAG)' },
  { what: { fr: 'Lyon', en: 'Lyon' }, who: 'TCL · SYTRAL Mobilités, data.grandlyon.com' },
  {
    what: { fr: 'Autres villes', en: 'Other cities' },
    who: 'transport.data.gouv.fr (GTFS, GTFS-RT)',
  },
  { what: { fr: 'Perturbations de Nancy', en: 'Nancy disruptions' }, who: 'reseau-stan.com' },
  { what: { fr: 'Trains et cars TER', en: 'TER trains and coaches' }, who: 'SNCF' },
  { what: { fr: 'Itinéraires hors de Grenoble', en: 'Routes outside Grenoble' }, who: 'Transitous (MOTIS)' },
  { what: { fr: 'Adresses', en: 'Addresses' }, who: 'Base Adresse Nationale (api-adresse.data.gouv.fr)' },
  { what: { fr: 'Qualité de l’air', en: 'Air quality' }, who: 'Atmo Auvergne-Rhône-Alpes' },
  { what: { fr: 'Carte', en: 'Map' }, who: 'MapTiler, OpenStreetMap' },
];

export function SettingsPanel({
  variant = 'panel',
  isOpen,
  setSettingsState,
  activeTab,
  setActiveTab,
  isMobile,
  language,
  setLanguage,
  theme,
  uiTheme,
  accountPseudo,
  accountAvatar,
  onOpenAccount,
  setTheme,
  fontSize,
  setFontSize,
  compactMode,
  setCompactMode,
  refreshInterval,
  setRefreshInterval,
  searchHistory,
  setSearchHistory,
  autoSync,
  setAutoSync,
  autoLocation,
  atmoFollowMap,
  setAtmoFollowMap,
  setAutoLocation,
  onOpenInstallGuide,
  compactThemes = false,
  showInstallGuide = false,
  appData,
  text,
  contentRef,
  panelRef,
}: SettingsPanelProps) {
  const { settings: perf, setSetting, resetSettings } = usePerfSettings();
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [helpCardClosed, setHelpCardClosed] = useState(() => {
    try {
      return localStorage.getItem('greLines_helpCardClosed') === '1';
    } catch {
      return false;
    }
  });
  const [isNotificationPromptOpen, setIsNotificationPromptOpen] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(
    () => notificationPermission() === 'granted' && notificationsEnabled(),
  );
  const tripNotificationPermission = notificationPermission();
  const resolvedTheme = uiTheme ?? (theme === 'light' ? 'light' : 'dark');
  const isLight = resolvedTheme === 'light';
  const dev = text.dev;
  const isFrench = language === 'fr';
  const devAvailable = !isMobile;

  const handleClose = () => setSettingsState('closed');

  const handleTripNotificationsEnable = async () => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    setNotificationsOn(granted);
  };

  const handleNotificationsToggle = () => {
    if (notificationsOn) {
      setNotificationsEnabled(false);
      setNotificationsOn(false);
      return;
    }

    if (notificationPermission() === 'granted') {
      setNotificationsEnabled(true);
      setNotificationsOn(true);
      return;
    }

    setIsNotificationPromptOpen(true);
  };

  const toggleNetwork = (codes: string[]) => {
    setSetting('networks', toggleNetworkCodes(perf.networks, codes));
  };

  const tabs = [
    { key: 'general', label: text.settings.general, icon: Cog6ToothIcon },
    { key: 'display', label: text.settings.display, icon: PaintBrushIcon },
    { key: 'accessibility', label: isFrench ? 'Accessibilité' : 'Accessibility', icon: FaWheelchair },
    { key: 'data', label: text.settings.data, icon: CircleStackIcon },
    ...(devAvailable && perf.devMode
      ? [{ key: 'dev', label: dev.section, icon: CommandLineIcon }]
      : []),
    { key: 'about', label: text.settings.about, icon: InformationCircleIcon },
  ];

  const notificationsContent = (
    <>
          <Group>
            <Row label="Notification" last>
              <span className="hidden">
                <span className="block text-[0.9375rem] font-medium text-white">
                  {language === 'fr' ? 'Notification' : 'Notification'}
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">
                  {tripNotificationPermission === 'granted'
                    ? language === 'fr'
                      ? 'Activées pour les trajets'
                      : 'Enabled for trips'
                    : tripNotificationPermission === 'denied'
                    ? language === 'fr'
                      ? 'Autorisation refusée'
                      : 'Permission denied'
                    : language === 'fr'
                    ? 'Configurer les notifications de trajet'
                    : 'Set up trip notifications'}
                </span>
              </span>
              <Toggle value={notificationsOn} onChange={handleNotificationsToggle} />
            </Row>
          </Group>

          <MobileNotificationPrompt
            isOpen={isNotificationPromptOpen}
            language={language}
            onEnable={async () => {
              await handleTripNotificationsEnable();
              setIsNotificationPromptOpen(false);
            }}
            onDismiss={() => {
              setNotificationsEnabled(false);
              setNotificationsOn(false);
              setIsNotificationPromptOpen(false);
            }}
          />
      <p className="px-4 text-xs leading-relaxed text-slate-500">
        {isFrench
          ? 'GreLines ne prévient que pendant un trajet : le moment de partir, la correspondance, l’arrêt où descendre. Ni promotion, ni rappel, ni nouveauté.'
          : 'GreLines only alerts you during a trip: when to leave, your connection, the stop to get off at. No promotions, no reminders, no news.'}
      </p>
    </>
  );

  const generalContent = (
    <>
      {isMobile && variant !== 'inline' && onOpenAccount && (
        <div className="mb-6">
          <button
            type="button"
            onClick={onOpenAccount}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
              isLight
                ? 'border-slate-200 bg-white hover:bg-slate-50'
                : 'border-slate-800 bg-slate-900/70 hover:bg-slate-800/70'
            }`}
          >
            {accountPseudo ? (
              <>
                <span
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border text-lg ${
                    isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-white'
                  }`}
                >
                  {accountAvatar ? (
                    <span aria-hidden>{accountAvatar}</span>
                  ) : (
                    <span aria-hidden>🙂</span>
                  )}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-[0.9375rem] font-bold ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {accountPseudo}
                </span>
              </>
            ) : (
              <span
                className={`min-w-0 flex-1 text-[0.9375rem] ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {language === 'fr' ? 'Connecter son compte' : 'Connect your account'}
              </span>
            )}
            <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-slate-500" />
          </button>
        </div>
      )}
      <Group>
        <Row label={text.labels.language}>
          <Dropdown
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'fr', label: 'Français' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Row>
        <Row label={text.labels.refreshInterval} last>
          <Dropdown
            value={refreshInterval}
            onChange={setRefreshInterval}
            options={[
              { value: '15s', label: text.options.refreshInterval[0] },
              { value: '30s', label: text.options.refreshInterval[1] },
              { value: '1m', label: text.options.refreshInterval[2] },
              { value: '2m', label: text.options.refreshInterval[3] },
            ]}
          />
        </Row>
      </Group>

      <Group>
        <Row label={text.labels.autoLocation}>
          <Toggle value={autoLocation} onChange={() => setAutoLocation(!autoLocation)} />
        </Row>
        <Row label={text.labels.atmoFollowMap}>
          <Toggle value={atmoFollowMap} onChange={() => setAtmoFollowMap(!atmoFollowMap)} />
        </Row>
        <Row label={text.labels.searchHistory} last>
          <Toggle value={searchHistory} onChange={() => setSearchHistory(!searchHistory)} />
        </Row>
      </Group>

      {isMobile && variant !== 'inline' && notificationsContent}

      {showInstallGuide && onOpenInstallGuide && (
        <Group>
          <button
            onClick={onOpenInstallGuide}
                className="w-full flex items-center justify-between rounded-2xl px-4 py-3 transition hover:bg-slate-700/40"
          >
            <span className="text-[0.9375rem] font-medium text-blue-400 text-left">
              {language === 'fr'
                ? "Comment installer l'app sur l'écran d'accueil"
                : 'How to install the app on your home screen'}
            </span>
            <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-slate-500" />
          </button>
        </Group>
      )}

      <Group>
        <a
          href={language === 'fr' ? '/fr' : '/en'}
          className="flex w-full items-center justify-between rounded-2xl px-4 py-3 transition hover:bg-slate-700/40"
        >
          <span className="text-left text-[0.9375rem] font-medium text-blue-400">
            {language === 'fr' ? 'Découvrir GreLines' : 'Discover GreLines'}
          </span>
          <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-slate-500" />
        </a>
      </Group>

      {devAvailable && (
        <>
          <Group>
            <Row label={dev.devMode} last>
              <Toggle
                value={perf.devMode}
                onChange={() => {
                  const next = !perf.devMode;
                  setSetting('devMode', next);
                  if (!next) {
                    setSetting('devOverlay', false);
                    setSimulatedOffline(false);
                    if (activeTab === 'dev') setActiveTab('general');
                  }
                }}
              />
            </Row>
          </Group>
          <p className="px-4 text-xs text-slate-500">{dev.devModeHint}</p>
        </>
      )}
    </>
  );

  const themePicker = (() => {
    const isFr = language === 'fr';
    const options: Array<{ value: 'light' | 'dark' | 'blue' | 'auto'; label: string }> = [
      { value: 'auto', label: 'Auto' },
      { value: 'light', label: isFr ? 'Clair' : 'Light' },
      { value: 'dark', label: isFr ? 'Sombre' : 'Dark' },
      { value: 'blue', label: isFr ? 'Bleu' : 'Blue' },
    ];

    return (
      <div className="px-4 py-3">
        <p className="mb-3 text-[0.9375rem] text-slate-200">{isFr ? 'Thème' : 'Theme'}</p>
        <div className={`grid gap-3 ${compactThemes ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(130px,160px))] lg:justify-start'}`}>
          {options.map((option) => {
            const current = theme ?? 'auto';
            const selected = current === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setTheme?.(option.value)}
                className="flex flex-col items-center gap-2"
              >
                <img
                  src={`/assets/${option.value}${selected ? '-selectioned' : ''}.svg`}
                  alt={option.label}
                  className="w-full rounded-lg"
                />
                <span className={`text-xs ${selected ? 'font-semibold text-white' : 'text-slate-400'}`}>
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  })();

  const displayContent = (
    <>
      <Group>
        {themePicker}
      </Group>

      <Group>
        <Row label={text.labels.fontSize}>
          <Select
            value={fontSize}
            onChange={setFontSize}
            options={[
              { value: 'small', label: text.options.fontSize[0] },
              { value: 'normal', label: text.options.fontSize[1] },
              { value: 'large', label: text.options.fontSize[2] },
            ]}
          />
        </Row>
        <Row label={text.labels.compactMode} last>
          <Toggle value={compactMode} onChange={() => setCompactMode(!compactMode)} />
        </Row>
      </Group>

      <Group>
        <Row label={dev.hideFooterTicker} last>
          <Toggle
            value={perf.hideFooterTicker}
            onChange={() => setSetting('hideFooterTicker', !perf.hideFooterTicker)}
          />
        </Row>
      </Group>
    </>
  );

  const devContent = (
    <>
      <Group>
        <Row label={dev.overlay} last>
          <Toggle value={perf.devOverlay} onChange={() => setSetting('devOverlay', !perf.devOverlay)} />
        </Row>
      </Group>

      <Group title={dev.rendering}>
        <Row label={dev.stopLineBadges}>
          <Toggle
            value={perf.stopLineBadges}
            onChange={() => setSetting('stopLineBadges', !perf.stopLineBadges)}
          />
        </Row>
        <Row label={dev.stopLabels}>
          <Toggle value={perf.stopLabels} onChange={() => setSetting('stopLabels', !perf.stopLabels)} />
        </Row>
        <Row label={dev.lineShapes}>
          <Toggle value={perf.lineShapes} onChange={() => setSetting('lineShapes', !perf.lineShapes)} />
        </Row>
        <Row label={dev.markerCap} last>
          <Select
            value={String(perf.markerCap)}
            onChange={value => setSetting('markerCap', Number(value))}
            options={[
              { value: '0', label: dev.unlimited },
              { value: '600', label: '600' },
              { value: '300', label: '300' },
              { value: '150', label: '150' },
            ]}
          />
        </Row>
      </Group>

      <Group title={dev.effects}>
        <Row label={dev.animations}>
          <Toggle value={perf.animations} onChange={() => setSetting('animations', !perf.animations)} />
        </Row>
        <Row label={dev.blurEffects}>
          <Toggle value={perf.blurEffects} onChange={() => setSetting('blurEffects', !perf.blurEffects)} />
        </Row>
        <Row label={dev.shadows} last>
          <Toggle value={perf.shadows} onChange={() => setSetting('shadows', !perf.shadows)} />
        </Row>
      </Group>

      <Group>
        <button
          onClick={resetSettings}
          className="w-full flex items-center justify-between rounded-2xl px-4 py-3 transition hover:bg-slate-700/40"
        >
          <span className="text-[0.9375rem] font-medium text-blue-400">{dev.reset}</span>
          <ChevronRightIcon className="h-4 w-4 text-slate-500" />
        </button>
      </Group>

    </>
  );

  const accessibilityContent = (
    <>
      <Group>
        <Row label={isFrench ? 'Mode accessibilité' : 'Accessibility mode'} last>
          <Toggle
            value={perf.accessibility}
            onChange={() => {
              const next = !perf.accessibility;
              setSetting('accessibility', next);
              setSetting('pmrRouting', next);
            }}
          />
        </Row>
      </Group>
      <p className="px-4 text-xs leading-relaxed text-slate-500">
        {isFrench
          ? 'Tous les arrêts ne sont pas renseignés : sans pastille ne veut pas dire inaccessible.'
          : 'Not every stop carries the information: no badge does not mean unfitted.'}
      </p>
    </>
  );

  const dataContent = (
    <>
      <Group>
        <Row label={text.labels.autoSync} last>
          <Toggle value={autoSync} onChange={() => setAutoSync(!autoSync)} />
        </Row>
      </Group>

      <Group title={language === 'fr' ? 'Métropole grenobloise' : 'Grenoble area'}>
        <NetworkTiles
          tiles={[...NETWORK_TILES, ...OPERATOR_TILES].map(tile => ({ ...tile, key: tile.codes.join('+') }))}
          isActive={key => key.split('+').every(code => perf.networks.includes(code))}
          onToggle={key => toggleNetwork(key.split('+'))}
        />
        {SECONDARY_NETWORKS.map((network, index) => (
          <Row
            key={network.code}
            label={network.label.replace(" — ", " · ")}
            last={index === SECONDARY_NETWORKS.length - 1}
          >
            <Toggle
              value={perf.networks.includes(network.code)}
              onChange={() => toggleNetwork([network.code])}
            />
          </Row>
        ))}
      </Group>

      <Group title={language === 'fr' ? 'Autres réseaux' : 'Other networks'}>
        <NetworkTiles
          tiles={[LYON_TILE, ...CITY_TILES].map(tile => ({ ...tile, key: tile.codes.join('+') }))}
          isActive={key => key.split('+').every(code => perf.networks.includes(code))}
          onToggle={key => toggleNetwork(key.split('+'))}
        />
        {CITY_NETWORKS.map((network, index) => (
          <Row
            key={network.code}
            label={network.label.replace(" — ", " · ")}
            last={index === CITY_NETWORKS.length - 1}
          >
            <Toggle
              value={perf.networks.includes(network.code)}
              onChange={() => toggleNetwork([network.code])}
            />
          </Row>
        ))}
      </Group>

      <Group title={text.networks.shared}>
        <NetworkTiles
          tiles={SHARED_TILES.map(tile => ({ ...tile, key: tile.setting }))}
          isActive={key => Boolean(perf[key as 'citiz' | 'voi'])}
          onToggle={key => setSetting(key as 'citiz' | 'voi', !perf[key as 'citiz' | 'voi'])}
        />
      </Group>

      <p className="mb-6 px-4 text-xs leading-relaxed text-slate-500">{text.networks.hint}</p>

      <Group>
        <button
          onClick={() => {
            void resetAllCaches();
          }}
          className="w-full flex items-center justify-between rounded-2xl px-4 py-3 hover:bg-slate-700/40 transition"
        >
          <span className="text-[0.9375rem] text-red-400 font-medium">
            {text.buttons.clearCache}
          </span>
          <ChevronRightIcon className="w-4 h-4 text-slate-500" />
        </button>
      </Group>

      <p className="text-xs text-slate-500 px-4">{text.labels.localStorageInfo}</p>
    </>
  );

  const aboutContent = (
    <div className="flex flex-col">
      <div className="flex items-center justify-center mb-5 pt-2">
        <div className="rounded-2xl px-4 py-3">
          <img
            src={resolvedTheme === 'dark' ? '/assets/GreLinesLOGO.png' : '/assets/GreLinesLOGO_dark.png'}
            alt="GreLines"
            className="h-28 w-auto"
          />
        </div>
      </div>

      <Group>
        <button
          onClick={() => setIsLegalOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 transition hover:bg-slate-700/40"
        >
          <span className={`text-[0.9375rem] ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {language === 'fr' ? 'Conditions et données' : 'Terms and data'}
          </span>
          <ChevronRightIcon className="h-4 w-4 text-slate-500" />
        </button>
      </Group>

      <Group>
        <Row label={text.misc.versionLabel} last>
          <span className="text-[0.9375rem] text-slate-400">{appData?.version || '2.0.1'}</span>
        </Row>
      </Group>

      <Group title={language === 'fr' ? 'Sources des données' : 'Data sources'}>
        {DATA_SOURCES.map((source, index) => (
          <Row key={source.what.fr} label={source.what[language]} last={index === DATA_SOURCES.length - 1}>
            <span className="text-right text-[0.8125rem] leading-snug text-slate-400">{source.who}</span>
          </Row>
        ))}
      </Group>

      {appData?.credits && appData.credits.length > 0 && (
        <Group title={text.settings.about}>
          {appData.credits.map((credit, i) => (
            <Row key={i} label={credit.role} last={i === appData.credits.length - 1}>
              {credit.link ? (
                <a
                  href={credit.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[0.9375rem] text-blue-400 hover:underline"
                >
                  {credit.name}
                </a>
              ) : (
                <span className="text-[0.9375rem] text-slate-400">{credit.name}</span>
              )}
            </Row>
          ))}
        </Group>
      )}

      <Group title={isFrench ? 'Données' : 'Data'}>
        <Row
          label={
            isFrench
              ? 'Merci à la Métropole de Grand Lyon de fournir ses données gratuitement.'
              : 'Thanks to Métropole de Grand Lyon for providing their data free of charge.'
          }
          last
        >
          <a
            href="https://data.grandlyon.com/portail/fr/accueil"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.9375rem] text-blue-400 hover:underline"
          >
            data.grandlyon.com
          </a>
        </Row>
      </Group>

      {isMobile ? (
        <div className="mb-2 grid grid-cols-3 gap-2">
          {[
            {
              href: 'https://gre-go.vercel.app/',
              alt: 'GreGo',
              src: resolvedTheme === 'dark' ? '/assets/GreGoLOGO.png' : '/assets/grego_light.png',
              height: 'h-7',
            },
            {
              href: 'https://grelines-og.vercel.app/',
              alt: 'OG',
              src: resolvedTheme === 'dark' ? '/assets/og_dark.png' : '/assets/og_light.png',
              height: 'h-5',
            },
            {
              href: 'https://github.com/antquu/GreLines',
              alt: 'GitHub',
              src: isLight ? '/assets/GitHub_LOGO_dark.png' : '/assets/GitHubLOGO.png',
              height: 'h-6',
            },
          ].map(entry => (
            <a
              key={entry.href}
              href={entry.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex min-h-[86px] min-w-0 flex-col justify-between rounded-2xl border p-3 transition active:scale-[0.97] ${
                isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
              }`}
            >
              <img src={entry.src} alt={entry.alt} className={`${entry.height} w-auto object-contain object-left`} />
              <ArrowRightIcon
                className={`ml-auto h-5 w-5 flex-shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}
              />
            </a>
          ))}
        </div>
      ) : (
      <div className="flex gap-2 mb-2">
        <a
          href="https://gre-go.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-1 h-12 flex items-center justify-center border rounded-xl transition ${
            isLight
              ? 'bg-transparent border-slate-300 hover:bg-slate-100'
              : 'bg-transparent border-slate-700 hover:bg-slate-800'
          }`}
        >
          <img
            src={resolvedTheme === 'dark' ? '/assets/GreGoLOGO.png' : '/assets/grego_light.png'}
            alt="GreGo"
            className="h-9 w-auto"
          />
        </a>
        <a
          href="https://grelines-og.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-1 h-12 flex items-center justify-center border rounded-xl transition ${
            isLight
              ? 'bg-transparent border-slate-300 hover:bg-slate-100'
              : 'bg-transparent border-slate-700 hover:bg-slate-800'
          }`}
        >
          <img
            src={resolvedTheme === 'dark' ? '/assets/og_dark.png' : '/assets/og_light.png'}
            alt="OG"
            className="h-6 w-auto"
          />
        </a>
        <a
          href="https://github.com/antquu/GreLines"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-1 h-12 flex items-center justify-center gap-2 border rounded-xl transition ${
            isLight
              ? 'bg-transparent border-slate-300 hover:bg-slate-100'
              : 'bg-transparent border-slate-700 hover:bg-slate-800'
          }`}
        >
          <img
            src={isLight ? '/assets/GitHub_LOGO_dark.png' : '/assets/GitHubLOGO.png'}
            alt="GitHub"
            className="h-7 w-auto"
          />
          <span className={`text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>Project</span>
        </a>
      </div>
      )}
    </div>
  );

  const renderTabByKey = (key: string) => {
    switch (key) {
      case 'display': return displayContent;
      case 'data':    return dataContent;
      case 'dev':     return devAvailable && perf.devMode ? devContent : generalContent;
      case 'notifications': return notificationsContent;
      case 'accessibility': return accessibilityContent;
      case 'about':   return aboutContent;
      case 'general':
      default:        return generalContent;
    }
  };

  const renderTab = () => renderTabByKey(activeTab);

  if (variant === 'inline') {
    const sections: Array<{ key: string; label: string; Icon: typeof BellIcon }> = [
      { key: 'notifications', label: isFrench ? 'Notifications' : 'Notifications', Icon: BellIcon },
      { key: 'general', label: text.settings.general, Icon: Cog6ToothIcon },
      { key: 'display', label: isFrench ? 'Apparence' : 'Appearance', Icon: PaintBrushIcon },
      { key: 'data', label: text.settings.data, Icon: CircleStackIcon },
      {
        key: 'accessibility',
        label: isFrench ? 'Accessibilité' : 'Accessibility',
        Icon: FaWheelchair as unknown as typeof BellIcon,
      },
    ];

    const helpSections: Array<{ key: string; label: string; Icon: typeof BellIcon }> = [
      { key: 'help', label: isFrench ? 'Aide et contact' : 'Help and contact', Icon: ChatBubbleLeftRightIcon },
      { key: 'about', label: text.settings.about, Icon: InformationCircleIcon },
    ];

    const rowInk = isLight ? 'text-slate-900' : 'text-white';
    const rowSurface = isLight ? 'bg-white' : 'bg-black';
    const rule = isLight ? 'border-slate-200' : 'border-slate-900';

    const list = (entries: Array<{ key: string; label: string; Icon: typeof BellIcon }>) => (
      <div className={`overflow-hidden rounded-2xl ${rowSurface}`}>
        {entries.map((entry, index) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setOpenSection(entry.key)}
            className={`flex w-full items-center gap-4 px-4 py-4 text-left transition active:bg-slate-500/10 ${
              index > 0 ? `border-t ${rule}` : ''
            }`}
          >
            <entry.Icon className={`h-6 w-6 flex-shrink-0 ${rowInk}`} />
            <span className={`min-w-0 flex-1 text-[1.0625rem] font-semibold ${rowInk}`}>{entry.label}</span>
            <ChevronRightIcon className={`h-5 w-5 flex-shrink-0 ${rowInk}`} />
          </button>
        ))}
      </div>
    );

    const openLabel =
      [...sections, ...helpSections].find(entry => entry.key === openSection)?.label ?? '';

    return (
      <SettingsLight value={isLight}>
      <BareSettings value>
      <div className="space-y-6">
        {onOpenAccount && (
          <button
            type="button"
            onClick={onOpenAccount}
            className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition active:scale-[0.99] ${rowSurface}`}
          >
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-2xl">
              {accountAvatar ? <span aria-hidden>{accountAvatar}</span> : <UserCircleIcon className="h-9 w-9 text-white" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[1.1875rem] font-bold ${rowInk}`}>
                {accountPseudo ?? (isFrench ? 'Connecter son compte' : 'Connect your account')}
              </span>
              <span className="block text-[0.9375rem] text-slate-500">
                {isFrench ? 'Compte' : 'Account'}
              </span>
            </span>
            <ChevronRightIcon className={`h-5 w-5 flex-shrink-0 ${rowInk}`} />
          </button>
        )}

        {!helpCardClosed && (
          <div className="relative overflow-hidden rounded-3xl" style={{ backgroundColor: '#1d4ed8' }}>
            <button
              type="button"
              onClick={() => {
                setHelpCardClosed(true);
                try {
                  localStorage.setItem('greLines_helpCardClosed', '1');
                } catch {
                }
              }}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white transition active:scale-90"
              aria-label={isFrench ? 'Fermer' : 'Close'}
            >
              <XMarkIcon className="h-5 w-5" style={{ color: '#1d4ed8' }} />
            </button>

            <button
              type="button"
              onClick={() => setOpenSection('help')}
              className="block w-full text-left"
            >
              <p className="px-5 pr-14 pt-5 text-[1.35rem] font-bold leading-snug" style={{ color: '#ffffff' }}>
                {isFrench ? 'Aide et contact' : 'Help and contact'}
              </p>
              <p className="mt-2 px-5 pb-4 pr-10 text-[0.9375rem] leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {isFrench
                  ? 'Un incident, un comportement, un objet oublié : à qui s’adresser, et le numéro à composer.'
                  : 'An incident, a behaviour, something left behind: who to talk to, and the number to call.'}
              </p>

              <svg viewBox="0 0 320 46" className="block w-full" aria-hidden>
                <g fill="#ffffff" opacity="0.9">
                  <path d="M4 46a26 26 0 0 0 26-26H17a13 13 0 0 1-13 13z" />
                  <rect x="46" y="6" width="16" height="16" />
                  <circle cx="92" cy="34" r="9" />
                  <rect x="124" y="2" width="11" height="40" transform="rotate(22 129 22)" />
                  <rect x="180" y="14" width="14" height="14" />
                  <path d="M220 34a22 22 0 0 1 22-22v12a10 10 0 0 0-10 10z" />
                  <rect x="272" y="28" width="16" height="16" transform="rotate(45 280 36)" />
                  <circle cx="316" cy="16" r="10" />
                </g>
              </svg>
            </button>
          </div>
        )}

        {list(sections)}
        {list(helpSections)}
      </div>

      {createPortal(
        <>
          <MinimalScreen
            isOpen={openSection !== null && openSection !== 'help'}
            title={openLabel}
            isLight={isLight}
            onBack={() => setOpenSection(null)}
          >
            <div className="px-4 pb-10">
              {openSection && openSection !== 'help' ? renderTabByKey(openSection) : null}
            </div>
          </MinimalScreen>

          <HelpContactScreen
            isOpen={openSection === 'help'}
            language={language}
            isLight={isLight}
            onBack={() => setOpenSection(null)}
          />
        </>,
        document.body,
      )}

      <LegalSheet
        isOpen={isLegalOpen}
        onClose={() => setIsLegalOpen(false)}
        language={language}
        theme={resolvedTheme}
        isMobile={isMobile}
      />
      </BareSettings>
      </SettingsLight>
    );
  }

  if (isMobile) {
    return (
      <>
      <MapSheet initialSnap={3} isOpen={isOpen} onClose={handleClose} isLight={isLight} zIndex={100}>
            <div className="flex items-center justify-between px-5 pt-2 pb-3 flex-shrink-0">
              <div className="w-9" />
              <h2
                className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}
                style={isLight ? { color: '#0f172a' } : undefined}
              >
                {text.misc.settingsTitle || (language === 'en' ? 'Settings' : 'Réglages')}
              </h2>
              <button
                onClick={handleClose}
                className={`w-9 h-9 flex items-center justify-center rounded-full border transition ${
                  isLight ? 'bg-white border-slate-200 hover:bg-slate-100' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <XMarkIcon className={`w-4 h-4 ${isLight ? 'text-slate-700' : 'text-white'}`} />
              </button>
            </div>

            <div className="flex gap-2 px-5 pb-4 overflow-x-auto scrollbar-hide flex-shrink-0">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3.5 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap transition flex-shrink-0 ${
                    activeTab === tab.key
                      ? 'bg-blue-600 text-white'
                      : isLight
                        ? 'bg-slate-100 border border-slate-200 text-slate-600'
                        : 'bg-slate-800 border border-slate-700 text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div ref={contentRef} className="overflow-y-auto flex-1 px-3 pb-12">
              {renderTab()}
            </div>
      </MapSheet>
      <LegalSheet
        isOpen={isLegalOpen}
        onClose={() => setIsLegalOpen(false)}
        language={language}
        theme={resolvedTheme}
        isMobile
      />
      </>
    );
  }

  return (
    <SettingsLight value={isLight}>
    <AnimatePresence>
      {isOpen && (
        <DesktopFinderWindow
          panelRef={panelRef}
          contentRef={contentRef}
          tabs={tabs}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={handleClose}
          title={text.misc.settingsTitle || (language === 'en' ? 'Settings' : 'Réglages')}
          theme={resolvedTheme}
        >
          {renderTab()}
        </DesktopFinderWindow>
      )}
    </AnimatePresence>
    <LegalSheet
      isOpen={isLegalOpen}
      onClose={() => setIsLegalOpen(false)}
      language={language}
      theme={resolvedTheme}
      isMobile={false}
    />
    </SettingsLight>
  );
}

interface DesktopFinderWindowProps {
  panelRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  tabs: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  activeTab: string;
  setActiveTab: (t: string) => void;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  theme?: 'light' | 'dark';
}

interface WindowFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WINDOW_MIN_W = 560;
const WINDOW_MIN_H = 380;

function dockPoint() {
  return { x: window.innerWidth - 120, y: window.innerHeight - 12 };
}

function centeredFrame(): WindowFrame {
  const w = Math.min(760, Math.round(window.innerWidth * 0.9));
  const h = Math.min(560, Math.round(window.innerHeight * 0.86));
  return { x: Math.round((window.innerWidth - w) / 2), y: Math.round((window.innerHeight - h) / 2), w, h };
}

function zoomedFrame(): WindowFrame {
  return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}

function clampFrame(frame: WindowFrame): WindowFrame {
  const w = Math.max(WINDOW_MIN_W, Math.min(frame.w, window.innerWidth));
  const h = Math.max(WINDOW_MIN_H, Math.min(frame.h, window.innerHeight));
  const x = Math.min(Math.max(frame.x, 80 - w), window.innerWidth - 80);
  const y = Math.min(Math.max(frame.y, 0), window.innerHeight - 44);
  return { x, y, w, h };
}

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const RESIZE_HANDLES: Array<{ edge: ResizeEdge; className: string; cursor: string }> = [
  { edge: 'n', className: 'left-2 right-2 -top-1 h-2', cursor: 'ns-resize' },
  { edge: 's', className: 'left-2 right-2 -bottom-1 h-2', cursor: 'ns-resize' },
  { edge: 'e', className: 'top-2 bottom-2 -right-1 w-2', cursor: 'ew-resize' },
  { edge: 'w', className: 'top-2 bottom-2 -left-1 w-2', cursor: 'ew-resize' },
  { edge: 'ne', className: '-top-1 -right-1 h-3 w-3', cursor: 'nesw-resize' },
  { edge: 'sw', className: '-bottom-1 -left-1 h-3 w-3', cursor: 'nesw-resize' },
  { edge: 'nw', className: '-top-1 -left-1 h-3 w-3', cursor: 'nwse-resize' },
  { edge: 'se', className: '-bottom-1 -right-1 h-3 w-3', cursor: 'nwse-resize' },
];

function DesktopFinderWindow({
  panelRef,
  contentRef,
  tabs,
  activeTab,
  setActiveTab,
  onClose,
  title,
  children,
}: DesktopFinderWindowProps) {
  const language = appLanguage();
  const [frame, setFrame] = useState<WindowFrame>(centeredFrame);
  const [restoreFrame, setRestoreFrame] = useState<WindowFrame | null>(null);
  const [animateFrame, setAnimateFrame] = useState(false);
  const [minimizing, setMinimizing] = useState(false);
  const zoomed = restoreFrame !== null;

  useEffect(() => {
    const onResize = () => setFrame(current => (restoreFrame ? zoomedFrame() : clampFrame(current)));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [restoreFrame]);

  const track = (event: React.MouseEvent, onMove: (dx: number, dy: number) => void, cursor: string) => {
    event.preventDefault();
    event.stopPropagation();
    setAnimateFrame(false);
    const startX = event.clientX;
    const startY = event.clientY;
    const previousCursor = document.body.style.cursor;
    document.body.style.setProperty('cursor', cursor);
    const move = (ev: MouseEvent) => onMove(ev.clientX - startX, ev.clientY - startY);
    const up = () => {
      document.body.style.setProperty('cursor', previousCursor);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const onTitleMouseDown = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button') || event.button !== 0) return;
    let start = frame;
    if (restoreFrame) {
      const ratio = (event.clientX - frame.x) / frame.w;
      start = {
        ...restoreFrame,
        x: Math.round(event.clientX - restoreFrame.w * ratio),
        y: Math.max(0, event.clientY - 22),
      };
      setRestoreFrame(null);
      setFrame(start);
    }
    track(event, (dx, dy) => setFrame(clampFrame({ ...start, x: start.x + dx, y: start.y + dy })), 'grabbing');
  };

  const onResizeMouseDown = (edge: ResizeEdge, cursor: string) => (event: React.MouseEvent) => {
    const start = frame;
    setRestoreFrame(null);
    track(event, (dx, dy) => {
      let { x, y, w, h } = start;
      if (edge.includes('e')) w = start.w + dx;
      if (edge.includes('s')) h = start.h + dy;
      if (edge.includes('w')) {
        w = Math.max(WINDOW_MIN_W, start.w - dx);
        x = start.x + (start.w - w);
      }
      if (edge.includes('n')) {
        h = Math.max(WINDOW_MIN_H, start.h - dy);
        y = Math.max(0, start.y + (start.h - h));
      }
      setFrame({
        x,
        y,
        w: Math.max(WINDOW_MIN_W, Math.min(w, window.innerWidth - x)),
        h: Math.max(WINDOW_MIN_H, Math.min(h, window.innerHeight - y)),
      });
    }, cursor);
  };

  const toggleZoom = () => {
    setAnimateFrame(true);
    if (restoreFrame) {
      setFrame(restoreFrame);
      setRestoreFrame(null);
    } else {
      setRestoreFrame(frame);
      setFrame(zoomedFrame());
    }
  };

  const minimize = () => {
    const node = panelRef.current;
    if (!node || minimizing) {
      if (!node) onClose();
      return;
    }
    const dock = dockPoint();
    const done = playGenie(node, { x: dock.x, y: dock.y, width: 44 });
    setMinimizing(true);
    void done.then(onClose);
  };

  const lightClass = 'relative flex h-3 w-3 items-center justify-center rounded-full transition hover:brightness-110';
  const glyphClass = 'h-2 w-2 text-black/60 opacity-0 group-hover/lights:opacity-100';

  return (
    <motion.div
      className={`fixed inset-0 select-none pointer-events-none ${minimizing ? 'z-[49]' : 'z-[60]'}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        ref={panelRef}
        className={`pointer-events-auto fixed transition-[border-radius] duration-300 ${zoomed ? 'rounded-none' : 'rounded-2xl shadow-2xl'}`}
        initial={{ opacity: 0, scale: 0.95, left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
        animate={
          minimizing
            ? { opacity: 0, left: frame.x, top: frame.y, width: frame.w, height: frame.h }
            : { opacity: 1, scale: 1, left: frame.x, top: frame.y, width: frame.w, height: frame.h }
        }
        exit={minimizing ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        transition={
          minimizing
            ? { duration: 0 }
            : {
                opacity: { duration: 0.2 },
                scale: { duration: 0.2, ease: 'easeOut' },
                default: animateFrame ? { type: 'spring', stiffness: 380, damping: 36 } : { duration: 0 },
              }
        }
        style={{ transformOrigin: '50% 50%' }}
      >
        <div
          className={`flex h-full w-full flex-col overflow-hidden bg-slate-900/95 transition-[border-radius] duration-300 ${
            zoomed ? 'rounded-none border-0' : 'rounded-2xl border border-slate-700'
          }`}
        >
        <div
          onMouseDown={onTitleMouseDown}
          onDoubleClick={event => {
            if (!(event.target as HTMLElement).closest('button')) toggleZoom();
          }}
          className="relative flex h-11 flex-shrink-0 cursor-default items-center justify-between border-b border-slate-700 bg-slate-800/80 px-3"
        >
          <div className="group/lights flex items-center gap-2">
            <button type="button" onClick={onClose} aria-label={language === 'en' ? 'Close' : 'Fermer'} className={`${lightClass} bg-[#ff5f57]`}>
              <XMarkIcon className={glyphClass} />
            </button>
            <button
              type="button"
              onClick={minimize}
              aria-label={language === 'en' ? 'Minimize to the Dock' : 'Placer dans le Dock'}
              className={`${lightClass} bg-[#febc2e]`}
            >
              <MinusIcon className={glyphClass} />
            </button>
            <button
              type="button"
              onClick={toggleZoom}
              aria-label={language === 'en' ? (zoomed ? 'Restore size' : 'Full screen') : zoomed ? 'Rétablir la taille' : 'Agrandir'}
              className={`${lightClass} bg-[#28c840]`}
            >
              {zoomed ? <ArrowsPointingInIcon className={glyphClass} /> : <ArrowsPointingOutIcon className={glyphClass} />}
            </button>
          </div>

          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs font-medium text-slate-300">
            {title}
          </span>

          <div className="w-[60px]" />
        </div>

        <div className="flex min-h-0 flex-1 select-text">
          <div className="flex w-48 flex-shrink-0 flex-col border-r border-slate-700 bg-slate-800/40 py-3">
            <div className="flex-1 space-y-0.5 px-3">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[0.8125rem] transition ${
                      active ? 'bg-blue-600 font-medium text-white' : 'text-slate-300 hover:bg-slate-700/60'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div ref={contentRef} className="min-w-0 flex-1 overflow-y-auto p-6">
            {children}
          </div>
        </div>

        </div>

        {!zoomed && !minimizing && RESIZE_HANDLES.map(handle => (
          <div
            key={handle.edge}
            onMouseDown={onResizeMouseDown(handle.edge, handle.cursor)}
            className={`absolute z-10 ${handle.className}`}
            style={{ cursor: handle.cursor }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}
