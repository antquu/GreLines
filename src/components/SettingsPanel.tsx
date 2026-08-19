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
} from '@heroicons/react/24/solid';
import { createContext, useContext, useRef, useState } from 'react';
import type React from 'react';
import { MobileNotificationPrompt } from './MobileNotificationPrompt';
import { usePerfSettings } from '../hooks/usePerfSettings';
import { idbClear } from '../services/persistentCache';
import { NETWORKS } from '../services/api';
import {
  notificationPermission,
  notificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
} from '../services/tripNotifications';

interface SettingsPanelProps {
  /**
   * « inline » rend les réglages à nu — toutes les sections à la suite, sans
   * feuille, sans onglets ni bouton de fermeture. C'est la forme qu'ils
   * prennent au bas de l'écran Compte, où ils ne sont pas un écran mais la
   * seconde moitié de celui qu'on regarde.
   */
  variant?: 'panel' | 'inline';
  isOpen: boolean;
  settingsState: 'closed' | 'peek' | 'open';
  setSettingsState: (s: 'closed' | 'peek' | 'open') => void;
  activeTab: string;
  setActiveTab: (t: string) => void;
  isMobile: boolean;
  language: 'fr' | 'en';
  setLanguage: (l: 'fr' | 'en') => void;
  
  /**
   * Le compte de l'appareil, et ce qu'on en fait.
   *
   * Le panneau ne connaît ni la base ni les cartes : il reçoit de quoi afficher
   * une ligne et un rappel de clic. C'est ce qui lui permet de rester le même
   * dans les réglages du téléphone, dans l'écran Compte et sur ordinateur.
   */
  accountPseudo?: string | null;
  accountAvatar?: string | null;
  onOpenAccount?: () => void;
  /** Le theme choisi, « auto » compris — c'est lui que les vignettes montrent. */
  theme?: 'light' | 'dark' | 'auto';
  /** Le theme reellement applique, une fois « auto » resolu. */
  uiTheme?: 'light' | 'dark';
  setTheme?: (t: 'light' | 'dark' | 'auto') => void;
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
  /** L'indice de qualité de l'air suit la commune au centre de la carte. */
  atmoFollowMap: boolean;
  setAtmoFollowMap: (value: boolean) => void;
  setAutoLocation: (v: boolean) => void;
  /**
   * Rouvre le tutoriel « app sur l'écran d'accueil ». Absent (ou non fourni)
   * quand l'application tourne déjà depuis l'écran d'accueil : l'entrée n'a
   * alors plus aucun sens.
   */
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

/**
 * Réglages à l'air libre.
 *
 * Dans le panneau, chaque groupe est une carte posée sur le fond — c'est la
 * convention des écrans de réglages. Au bas de l'écran Compte, la même carte
 * ferait doublon avec celle du portefeuille juste au-dessus : les rangées y
 * vivent donc sans cadre, séparées par un simple filet.
 */
const BareSettings = createContext(false);

/**
 * L'apparence, pour les petits composants de rangée.
 *
 * `Row`, `Group` et le sélecteur sont définis hors du composant principal et ne
 * voient donc pas son `resolvedTheme`. Ils écrivaient en blanc en dur, ce qui ne
 * se remarquait pas tant que les réglages vivaient sur un fond sombre — mais au
 * bas de l'écran Compte en thème clair, cela donnait du blanc sur du blanc.
 *
 * Un contexte plutôt qu'une prop à faire descendre partout : ces composants sont
 * utilisés des dizaines de fois, et il en aurait manqué une.
 */
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
      <span className={`text-[15px] ${isLight ? 'text-slate-900' : 'text-white'}`}>{label}</span>
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
        className={`rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition ${
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
/** Le cadre d'un groupe — une carte dans le panneau, rien du tout à l'air libre. */
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

/**
 * Autorités organisatrices, présentées par leur identité visuelle.
 *
 * Chaque vignette pilote un ou plusieurs codes réseau : « Tag » regroupe SEM et
 * SE2, qui sont le même réseau découpé en deux jeux de données côté MTAG.
 */
/*
 * Les logos vivent dans `/assets/network/`, à part du reste.
 *
 * Le pictogramme du TER s'appelle `ter.png` et sert déjà au badge de ligne :
 * deux fichiers du même nom pour deux usages différents finissent par se
 * marcher dessus. Un dossier propre au sélecteur règle la question une fois.
 *
 * Les suffixes d'état sélectionné ne sont pas uniformes — `-selectioned`,
 * `-selectionned`, `-selected` selon le fichier — alors on les écrit en toutes
 * lettres plutôt que de les déduire : une convention qu'on invente ici ne
 * renommerait pas les fichiers pour autant.
 */
const NETWORK_ASSETS = '/assets/network';

type NetworkTile = { asset: string; selectedAsset: string; codes: string[]; label: string };

/** Les autorités organisatrices, celles qui portent le réseau structurant. */
const NETWORK_TILES: NetworkTile[] = [
  { asset: 'Metropole', selectedAsset: 'Metropole-selectioned', codes: ['SEM', 'SE2'], label: 'Métropole' },
  { asset: 'Gresivaudan', selectedAsset: 'Gresivaudan-selectioned', codes: ['GSV'], label: 'Grésivaudan' },
  { asset: 'Voironnais', selectedAsset: 'Voironnais-selected', codes: ['TPV'], label: 'Pays Voironnais' },
  { asset: 'Region', selectedAsset: 'Region-selectioned', codes: ['C38'], label: 'Cars Région' },
];

/** Les opérateurs qui s'ajoutent aux précédents, chacun avec sa plaque. */
const OPERATOR_TILES: NetworkTile[] = [
  { asset: 'Bulle', selectedAsset: 'Bulle-selectionned', codes: ['BUL'], label: 'Bulles' },
  { asset: 'Transaltitude', selectedAsset: 'Transaltitude-selectionned', codes: ['TRA'], label: 'Transaltitude' },
  { asset: 'MCovoit', selectedAsset: 'MCovoit-selectionned', codes: ['MCO'], label: "M'Covoit" },
  { asset: 'TER', selectedAsset: 'TER-selectionned', codes: ['SNC'], label: 'TER' },
  { asset: 'TCL', selectedAsset: 'TCL-selectionned', codes: ['TCL'], label: 'TCL' },
];

/** Les véhicules en libre-service, qui ne sont pas des réseaux de lignes. */
const SHARED_TILES: Array<{ asset: string; selectedAsset: string; setting: 'citiz' | 'voi'; label: string }> = [
  { asset: 'citiz', selectedAsset: 'Citiz-selectionned', setting: 'citiz', label: 'Citiz' },
  { asset: 'voi', selectedAsset: 'voi-selectionned', setting: 'voi', label: 'Voi' },
];

/** Codes couverts par une vignette : le reste garde son interrupteur. */
const TILE_CODES = new Set([...NETWORK_TILES, ...OPERATOR_TILES].flatMap(tile => tile.codes));
const SECONDARY_NETWORKS = NETWORKS.filter(network => !TILE_CODES.has(network.code));

/**
 * Une grille de plaques à cocher.
 *
 * Le même dessin sert aux autorités organisatrices, aux opérateurs et aux
 * véhicules partagés : trois colonnes, même rapport 5:3 que le sélecteur de
 * thème, donc même échelle d'un groupe à l'autre. Éteinte, la plaque passe en
 * grisé — on voit qu'elle existe et qu'elle n'est pas retenue.
 */
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
    <div className="grid grid-cols-3 gap-3 px-4 py-4">
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
              src={`${NETWORK_ASSETS}/${active ? tile.selectedAsset : tile.asset}.png`}
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
        <p className="col-span-3 pt-1 text-center text-[11px] text-slate-500">{hint}</p>
      )}
    </div>
  );
}

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
  showInstallGuide = false,
  appData,
  text,
  contentRef,
  panelRef,
}: SettingsPanelProps) {
  const { settings: perf, setSetting, resetSettings } = usePerfSettings();
  /** Les conditions et le sort des données, dans leur propre feuille. */
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [isNotificationPromptOpen, setIsNotificationPromptOpen] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(
    () => notificationPermission() === 'granted' && notificationsEnabled(),
  );
  const tripNotificationPermission = notificationPermission();
  // Pas de `if (!isOpen) return null` ici : démonter le panneau à la fermeture
  // supprimerait son animation de sortie. La feuille mobile gère elle-même son
  // état fermé, et la fenêtre desktop est encadrée par <AnimatePresence>.
  const resolvedTheme = uiTheme ?? (theme === 'light' ? 'light' : 'dark');
  const isLight = resolvedTheme === 'light';
  const dev = text.dev;
  // Le mode développeur est réservé à l'ordinateur : ses options supposent un
  // curseur, un écran large, et n'ont pas de sens sur mobile.
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

  /**
   * Active ou désactive un bloc de réseaux d'un seul geste (le réseau Tag en
   * compte deux : SEM et sa suite SE2). Une sélection vide laisserait une carte
   * sans aucun arrêt, donc Tag est toujours conservé en dernier recours.
   */
  const toggleNetwork = (codes: string[]) => {
    const active = codes.every(code => perf.networks.includes(code));
    const next = active
      ? perf.networks.filter(code => !codes.includes(code))
      : [...new Set([...perf.networks, ...codes])];
    setSetting('networks', next.length > 0 ? next : ['SEM', 'SE2']);
  };

  // Tab metadata used by both mobile and desktop. Each tab has an icon (only
  // shown on desktop's Finder-style sidebar), a key, and a label.
  const tabs = [
    { key: 'general', label: text.settings.general, icon: Cog6ToothIcon },
    { key: 'display', label: text.settings.display, icon: PaintBrushIcon },
    { key: 'data', label: text.settings.data, icon: CircleStackIcon },
    // La section Développeur se place juste sous Données, et seulement quand le
    // mode développeur est actif.
    ...(devAvailable && perf.devMode
      ? [{ key: 'dev', label: dev.section, icon: CommandLineIcon }]
      : []),
    { key: 'about', label: text.settings.about, icon: InformationCircleIcon },
  ];

  // ── Tab contents (shared between mobile + desktop) ───────────────────────

  /*
   * Le contenu des onglets : des éléments, pas des composants.
   *
   * Ils étaient déclarés en fonctions (`const GeneralContent = () => …`) puis
   * rendus en `<GeneralContent />`. Une fonction déclarée dans le corps du
   * composant change d'identité à chaque rendu : React n'y voyait pas le même
   * type et démontait tout l'onglet pour le remonter à neuf. Chaque clic sur un
   * sélecteur rejouait donc l'arrivée de tous les autres, fermait le menu
   * déroulant qu'on venait d'ouvrir, perdait le focus — et le panneau remontait
   * en haut.
   *
   * En éléments, React reconcilie au lieu de remonter : seul ce qui a changé
   * change.
   */
  const generalContent = (
    <>
      {/* Le compte, en tête de section.
          Avant la langue et le rafraîchissement, parce qu'il ne se règle qu'une
          fois : ce qu'on fait une seule fois se met devant, ce qu'on ajuste se
          met après. La ligne change de forme selon qu'il existe — invitation
          d'un côté, profil de l'autre — mais garde sa place, pour qu'on n'ait pas
          à la chercher une fois créé. */}
      {isMobile && onOpenAccount && (
        <div className="mb-6">
          {/* Son propre cadre, même à l'air libre.
              Les autres rangées se passent de bordure dans l'écran Compte, où
              elles suivent le portefeuille. Celle-ci n'est pas un réglage mais
              une porte : le cadre arrondi le dit, et la distingue de la liste
              d'interrupteurs qui suit. */}
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
                  className={`min-w-0 flex-1 truncate text-[15px] font-bold ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {accountPseudo}
                </span>
              </>
            ) : (
              <span
                className={`min-w-0 flex-1 text-[15px] ${
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
        {/* Éteint, le panneau de qualité de l'air retrouve sa recherche : c'est
            à nouveau l'utilisateur qui désigne la commune. */}
        <Row label={text.labels.atmoFollowMap}>
          <Toggle value={atmoFollowMap} onChange={() => setAtmoFollowMap(!atmoFollowMap)} />
        </Row>
        <Row label={text.labels.searchHistory} last>
          <Toggle value={searchHistory} onChange={() => setSearchHistory(!searchHistory)} />
        </Row>
      </Group>

      {isMobile && (
        <>
          <Group>
            <Row label="Notification" last>
              <span className="hidden">
                <span className="block text-[15px] font-medium text-white">
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
        </>
      )}

      {/* Rien à installer si l'app tourne déjà depuis l'écran d'accueil : dans
          ce cas `showInstallGuide` est faux et la ligne disparaît. */}
      {showInstallGuide && onOpenInstallGuide && (
        <Group>
          <button
            onClick={onOpenInstallGuide}
                className="w-full flex items-center justify-between rounded-2xl px-4 py-3 transition hover:bg-slate-700/40"
          >
            <span className="text-[15px] font-medium text-blue-400 text-left">
              {language === 'fr'
                ? "Comment installer l'app sur l'écran d'accueil"
                : 'How to install the app on your home screen'}
            </span>
            <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-slate-500" />
          </button>
        </Group>
      )}

      {devAvailable && (
        <>
          <Group>
            <Row label={dev.devMode} last>
              <Toggle
                value={perf.devMode}
                onChange={() => {
                  const next = !perf.devMode;
                  setSetting('devMode', next);
                  // Sortir du mode développeur ne doit pas laisser l'overlay
                  // affiché ni l'onglet Développeur sélectionné dans le vide.
                  if (!next) {
                    setSetting('devOverlay', false);
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

  /**
   * Sélecteur de thème illustré : clair ou sombre.
   *
   * Le troisième choix, « auto », a disparu — il n'apportait qu'une hésitation
   * de plus dans une liste où deux vignettes suffisent. Le sombre tient ce
   * rôle : c'est lui qu'on trouve à la première ouverture, et c'est vers lui
   * que retombe un réglage « auto » hérité de l'ancienne version.
   */
  const themePicker = (() => {
    const isFr = language === 'fr';
    /* « Auto » en premier : c'est le défaut, et le seul des trois qui n'impose
       rien. Les deux autres sont des dérogations à ce que dit l'appareil. */
    const options: Array<{ value: 'light' | 'dark' | 'auto'; label: string }> = [
      { value: 'auto', label: 'Auto' },
      { value: 'light', label: isFr ? 'Clair' : 'Light' },
      { value: 'dark', label: isFr ? 'Sombre' : 'Dark' },
    ];

    return (
      <div className="px-4 py-3">
        <p className="mb-3 text-[15px] text-slate-200">{isFr ? 'Thème' : 'Theme'}</p>
        <div className="grid grid-cols-3 gap-3">
          {options.map((option) => {
            const selected = (theme ?? 'auto') === option.value;
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

  /**
   * Section Développeur : chaque bascule coupe réellement un morceau du rendu
   * ou des requêtes réseau, elle n'est pas décorative.
   */
  const devContent = (
    <>
      <Group>
        <Row label={dev.overlay} last>
          <Toggle value={perf.devOverlay} onChange={() => setSetting('devOverlay', !perf.devOverlay)} />
        </Row>
      </Group>
      <p className="mb-6 px-4 text-xs text-slate-500">{dev.overlayHint}</p>

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
          <span className="text-[15px] font-medium text-blue-400">{dev.reset}</span>
          <ChevronRightIcon className="h-4 w-4 text-slate-500" />
        </button>
      </Group>

      <p className="px-4 text-xs text-slate-500">{dev.note}</p>
    </>
  );

  const dataContent = (
    <>
      <Group>
        <Row label={text.labels.autoSync} last>
          <Toggle value={autoSync} onChange={() => setAutoSync(!autoSync)} />
        </Row>
      </Group>

      {/* Tout le sélecteur est en plaques désormais : les autorités
          organisatrices, les opérateurs, les véhicules partagés. Un réseau se
          reconnaît à sa marque bien avant à son nom, et une liste d'interrupteurs
          demandait de lire dix libellés pour trouver celui qu'on cherche. */}
      <Group title={text.networks.title}>
        <NetworkTiles
          tiles={NETWORK_TILES.map(tile => ({ ...tile, key: tile.codes.join('+') }))}
          isActive={key => key.split('+').every(code => perf.networks.includes(code))}
          onToggle={key => toggleNetwork(key.split('+'))}
        />
      </Group>

      <Group title={text.networks.others}>
        <NetworkTiles
          tiles={OPERATOR_TILES.map(tile => ({ ...tile, key: tile.codes.join('+') }))}
          isActive={key => key.split('+').every(code => perf.networks.includes(code))}
          onToggle={key => toggleNetwork(key.split('+'))}
          hint={
            language === 'fr'
              ? 'Touchez un réseau pour l’afficher ou le masquer.'
              : 'Tap a network to show or hide it.'
          }
        />
        {/* Ce qui n'a pas de plaque garde son interrupteur : le funiculaire des
            Petites Roches n'a pas de logo, et une case vide vaudrait moins
            qu'une ligne de texte. */}
        {SECONDARY_NETWORKS.map((network, index) => (
          <Row
            key={network.code}
            label={network.label}
            last={index === SECONDARY_NETWORKS.length - 1}
          >
            <Toggle
              value={perf.networks.includes(network.code)}
              onChange={() => toggleNetwork([network.code])}
            />
          </Row>
        ))}
      </Group>

      {/* Mobilités partagées : elles ne dépendent pas des réseaux de transport,
          elles s'appliquent immédiatement et ne rechargent pas le catalogue. */}
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
          onClick={async () => {
            localStorage.clear();
            // Le cache persistant (arrêts, lignes, tracés) vit dans IndexedDB
            // depuis l'optimisation du chargement : le vider aussi, sinon le
            // bouton ne fait plus qu'une partie du travail.
            await idbClear().catch(() => {});
            window.location.reload();
          }}
          className="w-full flex items-center justify-between rounded-2xl px-4 py-3 hover:bg-slate-700/40 transition"
        >
          <span className="text-[15px] text-red-400 font-medium">
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
            src={theme === 'dark' ? '/assets/GreLinesLOGO.png' : '/assets/GreLinesLOGO_dark.png'}
            alt="GreLines"
            className="h-28 w-auto"
          />
        </div>
      </div>

      {/* Ce qu'on fait des données se lit avant la version de l'application :
          c'est la question qu'on vient poser ici, l'autre est une curiosité. */}
      <Group>
        <button
          onClick={() => setIsLegalOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 transition hover:bg-slate-700/40"
        >
          <span className={`text-[15px] ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {language === 'fr' ? 'Conditions et données' : 'Terms and data'}
          </span>
          <ChevronRightIcon className="h-4 w-4 text-slate-500" />
        </button>
      </Group>

      <Group>
        <Row label={text.misc.versionLabel}>
          <span className="text-[15px] text-slate-400">{appData?.version || '2.0.1'}</span>
        </Row>
        <Row label={text.misc.dataSourceLabel} last>
          <span className="text-[15px] text-slate-400">MTAG API</span>
        </Row>
        <Row label={text.misc.dataSourceLabel} last>
          <span className="text-[15px] text-slate-400">SYSTRAL API</span>
        </Row>
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
                  className="text-[15px] text-blue-400 hover:underline"
                >
                  {credit.name}
                </a>
              ) : (
                <span className="text-[15px] text-slate-400">{credit.name}</span>
              )}
            </Row>
          ))}
        </Group>
      )}

      <p className="text-sm text-slate-400 mb-2 px-1">{text.misc.aboutDescription1}</p>
      <p className="text-sm text-slate-400 mb-5 px-1">{text.misc.aboutDescription2}</p>

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
            src={theme === 'dark' ? '/assets/GreGoLOGO.png' : '/assets/grego_light.png'}
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
            src={theme === 'dark' ? '/assets/og_dark.png' : '/assets/og_light.png'}
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
          {/* Le logotype GitHub existe en deux versions : la claire ne se voit
              pas sur un fond clair, et inversement. */}
          <img
            src={isLight ? '/assets/GitHub_LOGO_dark.png' : '/assets/GitHubLOGO.png'}
            alt="GitHub"
            className="h-7 w-auto"
          />
          <span className={`text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>Project</span>
        </a>
      </div>
    </div>
  );

  const renderTabByKey = (key: string) => {
    switch (key) {
      case 'display': return displayContent;
      case 'data':    return dataContent;
      case 'dev':     return devAvailable && perf.devMode ? devContent : generalContent;
      case 'about':   return aboutContent;
      case 'general':
      default:        return generalContent;
    }
  };

  const renderTab = () => renderTabByKey(activeTab);

  // ── Réglages à nu : toutes les sections à la suite, sans habillage ───────
  if (variant === 'inline') {
    return (
      <SettingsLight value={isLight}>
      <BareSettings value>
      <div className="space-y-8">
        {tabs.map(tab => (
          <section key={tab.key}>
            <h3
              className={`mb-3 px-1 text-[22px] font-extrabold leading-none ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {tab.label}
            </h3>
            {renderTabByKey(tab.key)}
          </section>
        ))}
      </div>
      {/* La feuille des conditions vit à côté des réglages, pas dedans : elle
          doit pouvoir se poser par-dessus eux, quelle que soit leur forme. */}
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

  // ── Mobile: iOS-style settings sheet ─────────────────────────────────────
  if (isMobile) {
    return (
      <>
      <MapSheet initialSnap={3} isOpen={isOpen} onClose={handleClose} isLight={isLight} zIndex={100}>
            {/* Top bar — iOS-style: title centered, close button right */}
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

            {/* Tab pills under the title — horizontal scroll */}
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

            {/* Scrollable settings groups */}
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

  // ── Desktop: Finder-style draggable window ───────────────────────────────
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
          /* La fenêtre se peint dans le thème appliqué, pas dans le thème
             choisi : « auto » n'est pas une couleur. */
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

// ─── Desktop Finder-style window (draggable) ─────────────────────────────────
// Two-column layout: a translucent sidebar on the left (Finder-y), main panel
// on the right. The whole window is draggable by the title bar (mouse-down on
// the bar starts a drag, mouse-up anywhere releases). Position is local state
// so the parent doesn't have to know.

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
  // Initial position: roughly centered-up. We use `pos` as the live transform
  // so framer-motion doesn't have to re-mount the panel on each update.
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragOriginRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null);

  /**
   * Title-bar drag handlers. We attach the listeners to `window` once a drag
   * starts so the user can briefly move outside the title bar without
   * dropping the drag, and we always clean them up on `mouseup`.
   */
  const onTitleMouseDown = (e: React.MouseEvent) => {
    // Ignore clicks on the close button and other interactive elements inside
    // the title bar.
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragOriginRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: pos.x,
      posY: pos.y,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragOriginRef.current) return;
      setPos({
        x: dragOriginRef.current.posX + (ev.clientX - dragOriginRef.current.mouseX),
        y: dragOriginRef.current.posY + (ev.clientY - dragOriginRef.current.mouseY),
      });
    };
    const onUp = () => {
      dragOriginRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-md px-4 py-8 select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {/* Inner wrapper holds the drag transform so it doesn't fight with
            framer-motion's entry animation (which animates `transform` on the
            outer motion.div). Once the entry finishes, this inner transform
            tracks the user's drag without ever conflicting. */}
        <div
          ref={panelRef}
          style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
          className="relative bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl w-[760px] max-w-[90vw] h-[560px] max-h-[86vh] overflow-hidden flex flex-col"
        >
        {/* Title bar — the user can grab it anywhere (including the title
            text and the decorative yellow/green dots) to drag the window.
            Only the close button is excluded, via the closest('button') check
            in onTitleMouseDown. */}
        <div
          onMouseDown={onTitleMouseDown}
          className="h-11 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing flex-shrink-0 relative"
        >
          {/* Traffic lights — close only (yellow/green decorative).
              `pointer-events: none` on the decorative ones lets mousedown
              events pass through to the title bar so the user can grab there
              too. */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              aria-label="close"
              className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110 transition relative group"
            >
              <XMarkIcon className="w-2.5 h-2.5 text-black/60 absolute inset-0 m-auto opacity-0 group-hover:opacity-100" />
            </button>
            <span className="w-3 h-3 rounded-full bg-[#febc2e] pointer-events-none" />
            <span className="w-3 h-3 rounded-full bg-[#28c840] pointer-events-none" />
          </div>

          {/* Title — centered, plain text, doesn't intercept clicks. */}
          <span className="text-xs font-medium text-slate-300 absolute left-1/2 -translate-x-1/2 pointer-events-none">
            {title}
          </span>

          {/* Right spacer to keep title centered */}
          <div className="w-[60px]" />
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar — Finder-style: translucent, icon + label */}
          <div className="w-48 bg-slate-800/40 border-r border-slate-700 flex flex-col py-3 flex-shrink-0">
            <div className="px-3 space-y-0.5 flex-1">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] rounded-lg transition ${
                      active
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-slate-300 hover:bg-slate-700/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main content panel */}
          <div ref={contentRef} className="flex-1 overflow-y-auto p-6 min-w-0">
            {children}
          </div>
        </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
