import { motion } from 'framer-motion';
import { Sheet } from 'react-modal-sheet';
import {
  XMarkIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  PaintBrushIcon,
  CircleStackIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/solid';
import { useRef, useState } from 'react';
import type React from 'react';

interface SettingsPanelProps {
  isOpen: boolean;
  settingsState: 'closed' | 'peek' | 'open';
  setSettingsState: (s: 'closed' | 'peek' | 'open') => void;
  activeTab: string;
  setActiveTab: (t: string) => void;
  isMobile: boolean;
  language: 'fr' | 'en';
  setLanguage: (l: 'fr' | 'en') => void;
  /** Theme is hard-coded to dark for now — these props are kept for compat. */
  theme?: 'light' | 'dark' | 'auto';
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
  setAutoLocation: (v: boolean) => void;
  appData: { version: string; credits: Array<{ role: string; name: string; link?: string }> } | null;
  text: any;
  contentRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}

// ─── Atomic settings rows ────────────────────────────────────────────────────
// All rows share the same height/horizontal padding, with a left label and a
// right-aligned control. Mobile groups them with subtle dividers (iOS feel);
// desktop reuses the same atoms inside a content panel.

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

const Row = ({
  label,
  children,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) => (
  <div
    className={`flex items-center justify-between px-4 py-3 ${
      last ? '' : 'border-b border-slate-700/60'
    }`}
  >
    <span className="text-[15px] text-white">{label}</span>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

const Select = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) => (
  <div className="inline-flex max-w-[360px] flex-wrap justify-end gap-1 rounded-xl bg-slate-950/70 p-1">
    {options.map(o => (
      <motion.button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        whileTap={{ scale: 0.96 }}
        className={`rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition ${
          value === o.value
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
        }`}
      >
        {o.label}
      </motion.button>
    ))}
  </div>
);

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
}) => (
  <div className="mb-6">
    {title && (
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 mb-2">
        {title}
      </h4>
    )}
    <div className="bg-slate-800/90 border border-slate-700 rounded-2xl overflow-hidden shadow-[0_12px_30px_rgba(2,6,23,0.22)]">
      {children}
    </div>
  </div>
);

export function SettingsPanel({
  isOpen,
  setSettingsState,
  activeTab,
  setActiveTab,
  isMobile,
  language,
  setLanguage,
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
  setAutoLocation,
  appData,
  text,
  contentRef,
  panelRef,
}: SettingsPanelProps) {
  if (!isOpen) return null;

  const handleClose = () => setSettingsState('closed');

  // Tab metadata used by both mobile and desktop. Each tab has an icon (only
  // shown on desktop's Finder-style sidebar), a key, and a label.
  const tabs = [
    { key: 'general', label: text.settings.general, icon: Cog6ToothIcon },
    { key: 'display', label: text.settings.display, icon: PaintBrushIcon },
    { key: 'data', label: text.settings.data, icon: CircleStackIcon },
    { key: 'about', label: text.settings.about, icon: InformationCircleIcon },
  ];

  // ── Tab contents (shared between mobile + desktop) ───────────────────────

  const GeneralContent = () => (
    <>
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
        <Row label={text.labels.searchHistory} last>
          <Toggle value={searchHistory} onChange={() => setSearchHistory(!searchHistory)} />
        </Row>
      </Group>
    </>
  );

  const DisplayContent = () => (
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
  );

  const DataContent = () => (
    <>
      <Group>
        <Row label={text.labels.autoSync} last>
          <Toggle value={autoSync} onChange={() => setAutoSync(!autoSync)} />
        </Row>
      </Group>

      <Group>
        <button
          onClick={() => { localStorage.clear(); window.location.reload(); }}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/40 transition"
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

  const AboutContent = () => (
    <div className="flex flex-col">
      <div className="flex items-center justify-center mb-5 pt-2">
        <img src="/assets/GreLinesAssoLOGO.png" alt="GreLines" className="h-20 w-auto" />
      </div>

      <Group>
        <Row label={text.misc.versionLabel}>
          <span className="text-[15px] text-slate-400">{appData?.version || '2.0.1'}</span>
        </Row>
        <Row label={text.misc.dataSourceLabel} last>
          <span className="text-[15px] text-slate-400">MTAG API</span>
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
          className="flex-1 h-12 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition"
        >
          <img src="/assets/GreGoLOGO.png" alt="GreGo" className="h-7 w-auto" />
        </a>
        <a
          href="https://github.com/antquu/GreLines"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-12 flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition"
        >
          <img src="/assets/GitHubLOGO.png" alt="GitHub" className="h-7 w-auto" />
          <span className="text-white text-xs">Project</span>
        </a>
      </div>
    </div>
  );

  const renderTab = () => {
    switch (activeTab) {
      case 'display': return <DisplayContent />;
      case 'data':    return <DataContent />;
      case 'about':   return <AboutContent />;
      case 'general':
      default:        return <GeneralContent />;
    }
  };

  // ── Mobile: iOS-style settings sheet ─────────────────────────────────────
  if (isMobile) {
    return (
      <Sheet
        style={{ zIndex: 100 }}
        isOpen={isOpen}
        onClose={handleClose}
        snapPoints={[0, 0.6, 1]}
        initialSnap={2}
      >
        <Sheet.Container style={{ borderRadius: '24px 24px 0 0', backgroundColor: '#0f172a', zIndex: 100 }}>
          <Sheet.Header />
          <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>
            {/* Top bar — iOS-style: title centered, close button right */}
            <div className="flex items-center justify-between px-5 pt-2 pb-3 flex-shrink-0">
              <div className="w-9" />
              <h2 className="text-base font-semibold text-white">
                {text.misc.settingsTitle || 'Réglages'}
              </h2>
              <button
                onClick={handleClose}
                className="w-9 h-9 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full hover:bg-slate-700 transition"
              >
                <XMarkIcon className="w-4 h-4 text-white" />
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
          </Sheet.Content>
        </Sheet.Container>
        <Sheet.Backdrop onTap={handleClose} style={{ zIndex: 99 }} />
      </Sheet>
    );
  }

  // ── Desktop: Finder-style draggable window ───────────────────────────────
  return (
    <DesktopFinderWindow
      panelRef={panelRef}
      contentRef={contentRef}
      tabs={tabs}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onClose={handleClose}
      title={text.misc.settingsTitle || 'Réglages'}
    >
      {renderTab()}
    </DesktopFinderWindow>
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-md px-4 py-8 select-none">
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
            <div className="px-3 space-y-0.5">
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
    </div>
  );
}
