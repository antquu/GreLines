import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionTemplate } from 'framer-motion';
import { Sheet, type SheetRef } from 'react-modal-sheet';
import {
  MapSheetShell,
  MapSheetBody,
  mapSheetSnapPoints,
  collapsedNavPadding,
  readSafeAreaBottom,
  useSnapValue,
  COMPACT_ITEM_WIDTH,
  SmoothSheetContent,
} from './MapSheet';
import {
  MapPinIcon,
  ExclamationTriangleIcon,
  ArrowsRightLeftIcon,
  StarIcon,
  UserCircleIcon,
} from '@heroicons/react/24/solid';
import { MobileNavBar, NAV_ITEM_WIDTH, type MobileNavItem } from './MobileNavBar';
import { NearbyDepartures } from './NearbyDepartures';

import type { Stop } from '../types';
import { findClosestStops, haversineMeters } from '../utils/geo';
import type { Favorite } from '../services/favorites';
import type { FavoriteDetail } from '../hooks/useFavoriteDetails';
import { tx } from '../i18n';

const HEADER_SWAP_HEIGHT = 76;

export const HOME_SHEET_ID = 'gl-home-sheet';
const NEARBY_SETTLE_MS = 1000;
const NEARBY_MOVE_METERS = 100;
let nearbyAutoOpened = false;
const NEARBY_MAX_METERS = 3000;
const HOME_PEEK_SNAP = 2;
const HOME_MID_SNAP = 3;
const HOME_LAST_SNAP = 4;
const HOME_PEEK_HEIGHT = 0.36;

function homeSnapPoints(base: number[]): number[] {
  return [...base.slice(0, 2), HOME_PEEK_HEIGHT, ...base.slice(2)];
}

function SheetHeaderSwap({
  navBar,
  searchBar,
}: {
  navBar: React.ReactNode;
  searchBar?: React.ReactNode;
}) {
  const navOpacity = useSnapValue([1, 1, 0, 0, 0], 1);
  const searchOpacity = useSnapValue([0, 0, 1, 1, 1], 0);
  const { currentSnap } = Sheet.useContext();
  const searchTakesOver = (currentSnap ?? 1) > 1;

  if (!searchBar) return <>{navBar}</>;

  return (
    <div className="relative z-30" style={{ height: HEADER_SWAP_HEIGHT }}>
      <motion.div
        className="absolute inset-x-0 top-0"
        style={{ opacity: navOpacity, pointerEvents: searchTakesOver ? 'none' : 'auto' }}
      >
        {navBar}
      </motion.div>
      <motion.div
        className="absolute inset-x-0 top-0 z-30 flex h-full items-center px-4"
        style={{ opacity: searchOpacity, pointerEvents: searchTakesOver ? 'auto' : 'none' }}
      >
        {searchBar}
      </motion.div>
    </div>
  );
}

function SheetBackdrop({ onTap, snapIdx }: { onTap: () => void; snapIdx: number }) {
  const opacity = useSnapValue([0, 0, 0, 0, 0.5], 0);
  const backgroundColor = useMotionTemplate`rgba(2, 6, 23, ${opacity})`;

  return (
    <Sheet.Backdrop
      {...(snapIdx === HOME_LAST_SNAP ? { onTap } : {})}
      style={{
        backgroundColor,
        opacity: 1,
        zIndex: 9,
      }}
    />
  );
}

interface HomeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  stops: Stop[];
  currentLocation: { lat: number; lon: number } | null;
  onStopClick: (stop: Stop, lineFilter?: string[]) => void;
  onOpenTraffic: () => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  onOpenFavorites: () => void;
  locked?: boolean;
  lockedScreen?: 'account' | 'favorites' | 'route';
  layerAbove?: boolean;
  searchOpen?: boolean;
  onLeaveAccount?: () => void;
  onLeaveFavorites?: () => void;
  onLeaveRoute?: () => void;
  navCompact?: boolean;
  onOpenItinerary: () => void;
  onSnapChange?: (snapIdx: number) => void;
  onSheetProgress?: (progress: number) => void;
  onHomeProgress?: (progress: number) => void;
  lowerOnMapPanSignal?: number;

  snapToMiniSignal?: number;

  openToMidSignal?: number;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  favorites: Favorite[];
  favoriteDetails: FavoriteDetail[];

  searchBar?: React.ReactNode;
}

const getText = (language: 'fr' | 'en') => ({
  nearPrefix: tx(language === 'fr').homeSheet.near,
  noStopsNearby: tx(language === 'fr').homeSheet.noStopsNearby,
  noStopsNearbyHint:
    tx(language === 'fr').homeSheet.thisAreaIsNot,
  noLocation: tx(language === 'fr').homeSheet.locationUnavailable,
  noLocationHint:
    tx(language === 'fr').homeSheet.enableLocationToSee,
  favoritesTitle: tx(language === 'fr').homeSheet.favorites,
  noFavorites: tx(language === 'fr').homeSheet.noFavoritesYetAdd,
  loading: tx(language === 'fr').homeSheet.loading,
  noDepartures: tx(language === 'fr').homeSheet.noUpcomingDepartures,
  navHome: tx(language === 'fr').homeSheet.nearby,
  navRoute: tx(language === 'fr').homeSheet.route,
  navFavorites: tx(language === 'fr').homeSheet.favorites,
  navAccount: tx(language === 'fr').homeSheet.account,
  placesTitle: tx(language === 'fr').homeSheet.places,
  homeLabel: tx(language === 'fr').homeSheet.home,
  workLabel: tx(language === 'fr').homeSheet.work,
  addLabel: tx(language === 'fr').homeSheet.add,
  nearbyLabel: tx(language === 'fr').homeSheet.nearby2,
  trafficLabel: tx(language === 'fr').homeSheet.trafficInfo,
  itineraryLabel: tx(language === 'fr').homeSheet.itinerary,
  settingsLabel: tx(language === 'fr').homeSheet.settings,
  remove: tx(language === 'fr').homeSheet.remove,
  direction: tx(language === 'fr').homeSheet.to,
});

export const HomeSheet = ({
  isOpen,
  onClose,
  stops,
  currentLocation,
  onStopClick,
  onOpenTraffic,
  onOpenAccount,
  onOpenFavorites,
  locked = false,
  lockedScreen,
  layerAbove = false,
  searchOpen = false,
  onLeaveAccount,
  onLeaveFavorites,
  onLeaveRoute,
  navCompact = false,
  onOpenItinerary,
  onSnapChange,
  onSheetProgress,
  onHomeProgress,
  lowerOnMapPanSignal,
  snapToMiniSignal,
  openToMidSignal,
  language,
  theme = 'dark',
  searchBar,
}: HomeSheetProps) => {
  const text = getText(language);

  const isLight = theme === 'light';


  const surfaceClass = isLight
    ? 'bg-white border border-slate-200 shadow-[0_20px_50px_rgba(148,163,184,0.18)]'
    : 'bg-[#2c2d31]/90 border-white/10 shadow-xl';
  const titleClass = isLight ? 'text-slate-900' : 'text-white';
  const mutedClass = isLight ? 'text-slate-500' : 'text-slate-400';

  const [nearbyOrigin, setNearbyOrigin] = useState(currentLocation);
  const [originSettling, setOriginSettling] = useState(false);
  useEffect(() => {
    if (!currentLocation) return;
    if (!nearbyOrigin) {
      setNearbyOrigin(currentLocation);
      return;
    }
    if (haversineMeters(nearbyOrigin.lat, nearbyOrigin.lon, currentLocation.lat, currentLocation.lon) < NEARBY_MOVE_METERS) {
      setOriginSettling(false);
      return;
    }
    setOriginSettling(true);
    const timer = window.setTimeout(() => {
      setNearbyOrigin(currentLocation);
      setOriginSettling(false);
    }, NEARBY_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [currentLocation?.lat, currentLocation?.lon]);

  const nearby = useMemo(() => {
    if (!nearbyOrigin) return [];
    const seen = new Set<string>();
    return findClosestStops(stops, nearbyOrigin.lat, nearbyOrigin.lon, 10)
      .filter(({ meters }) => meters <= NEARBY_MAX_METERS)
      .filter(({ stop }) => {
        const key = stop.name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);
  }, [stops, nearbyOrigin]);


  const sheetRef = useRef<SheetRef>(null);
  useEffect(() => {
    if (!lowerOnMapPanSignal || locked) return;
    if (snapIdxRef.current >= HOME_MID_SNAP) sheetRef.current?.snapTo(HOME_PEEK_SNAP);
  }, [lowerOnMapPanSignal]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [snapIdx, setSnapIdx] = useState<number>(1);
  const snapIdxRef = useRef(snapIdx);
  snapIdxRef.current = snapIdx;
  const openOnceNearbyReady = useCallback(() => {
    if (nearbyAutoOpened || locked || !isOpen) return;
    nearbyAutoOpened = true;
    if (snapIdxRef.current <= 1) sheetRef.current?.snapTo(HOME_MID_SNAP);
  }, [locked, isOpen]);

  const outsideServedArea = Boolean(nearbyOrigin) && !originSettling && nearby.length === 0 && stops.length > 0;
  useEffect(() => {
    if (!outsideServedArea) return;
    nearbyAutoOpened = false;
    if (!locked && isOpen && snapIdxRef.current > 1) sheetRef.current?.snapTo(1);
  }, [outsideServedArea, locked, isOpen]);
  const safeBottom = useMemo(readSafeAreaBottom, []);
  const [activeTab, setActiveTab] = useState('home');

  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 375 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onSheetProgressRef = useRef(onSheetProgress);
  useEffect(() => { onSheetProgressRef.current = onSheetProgress; }, [onSheetProgress]);
  const onHomeProgressRef = useRef(onHomeProgress);
  useEffect(() => { onHomeProgressRef.current = onHomeProgress; }, [onHomeProgress]);

  const handleSnapChange = (idx: number) => {
    setSnapIdx(idx);
    onSnapChange?.(idx);
    if (idx !== HOME_LAST_SNAP && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  const collapseToMini = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    sheetRef.current?.snapTo(1);
  };

  const navItems: MobileNavItem[] = useMemo(() => [
    {
      key: 'home',
      label: text.navHome,
      Icon: MapPinIcon,
      onSelect: () => {
        setActiveTab('home');
        onLeaveAccount?.();
        onLeaveFavorites?.();
        onLeaveRoute?.();
        if (snapIdx > 1) collapseToMini();
        else sheetRef.current?.snapTo(HOME_MID_SNAP);
      },
    },
    {
      key: 'route',
      label: text.navRoute,
      Icon: ArrowsRightLeftIcon,
      onSelect: () => {
        setActiveTab('route');
        onLeaveAccount?.();
        onLeaveFavorites?.();
        onOpenItinerary();
      },
    },
    {
      key: 'favorites',
      label: text.navFavorites,
      Icon: StarIcon,
      onSelect: () => {
        setActiveTab('favorites');
        onLeaveRoute?.();
        onOpenFavorites();
      },
    },
    {
      key: 'account',
      label: text.navAccount,
      Icon: UserCircleIcon,
      onSelect: () => {
        setActiveTab('account');
        onLeaveFavorites?.();
        onLeaveRoute?.();
        onOpenAccount();
      },
    },
  ], [text, onOpenItinerary, onOpenAccount, onOpenFavorites, onLeaveAccount, onLeaveFavorites, onLeaveRoute, snapIdx]);

  const collapsedPadding = useMemo(
    () =>
      collapsedNavPadding(
        viewportWidth,
        navCompact ? COMPACT_ITEM_WIDTH : NAV_ITEM_WIDTH,
        navItems.length,
      ),
    [navItems.length, viewportWidth, navCompact],
  );

  useEffect(() => {
    if (isOpen) {
      onSnapChange?.(1);
      onSheetProgressRef.current?.(0.15);
      const t = setTimeout(() => sheetRef.current?.snapTo(1), 50);
      return () => clearTimeout(t);
    }
    onSnapChange?.(0);
    onSheetProgressRef.current?.(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!locked) return;
    const timer = window.setTimeout(() => sheetRef.current?.snapTo(1), 30);
    return () => window.clearTimeout(timer);
  }, [locked, navCompact]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(locked ? lockedScreen ?? 'account' : 'home');
  }, [isOpen, locked, lockedScreen]);

  useEffect(() => {
    if (snapToMiniSignal === undefined) return;
    if (!isOpen) return;
    setActiveTab('home');
    collapseToMini();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapToMiniSignal]);

  useEffect(() => {
    if (openToMidSignal === undefined || openToMidSignal === 0) return;
    if (!isOpen) return;
    sheetRef.current?.snapTo(HOME_MID_SNAP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openToMidSignal]);

  return (
    <Sheet
      ref={sheetRef}
      style={{ zIndex: layerAbove ? 1001 : 10 }}
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={homeSnapPoints(mapSheetSnapPoints({ bottomInset: safeBottom, noHandle: locked, compact: navCompact }))}
      initialSnap={1}
      onOpenEnd={() => sheetRef.current?.snapTo(Math.max(1, snapIdxRef.current))}
      disableDrag={locked || searchOpen}
      disableDismiss
      onSnap={handleSnapChange}
      onOpenStart={() => {}}
    >
	    <MapSheetShell isLight={isLight} bottomInset={safeBottom} collapsedPadding={collapsedPadding} peek id={HOME_SHEET_ID}>
	        <Sheet.Header style={{ position: 'relative', zIndex: 30 }}>
	          <div
	            className={`flex justify-center overflow-hidden transition-all duration-300 ${
	              locked ? 'h-0 pt-0 pb-0' : 'pt-2 pb-1'
	            }`}
	          >
	            <div
	              className={`h-1.5 w-16 rounded-full transition-opacity duration-200 ${
	                isLight ? 'bg-slate-300' : 'bg-white/30'
	              } ${activeTab === 'home' ? 'opacity-100' : 'opacity-0'}`}
	            />
	          </div>
	          <SheetHeaderSwap
	            navBar={<MobileNavBar items={navItems} activeKey={activeTab} isLight={isLight} compact={navCompact} />}
	            searchBar={locked || !searchBar ? undefined : (
              <div className="flex w-full min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">{searchBar}</div>
                {!searchOpen && (
                  <button
                    type="button"
                    onClick={onOpenTraffic}
                    aria-label={text.trafficLabel}
                    title={text.trafficLabel}
                    className={`flex h-[58px] w-[58px] flex-shrink-0 items-center justify-center rounded-full border shadow-2xl backdrop-blur-xl transition active:scale-95 ${
                      isLight ? 'border-slate-200 bg-white/95 shadow-slate-200/60' : 'border-white/10 bg-slate-950/82 shadow-black/30'
                    }`}
                  >
                    <ExclamationTriangleIcon className={`h-6 w-6 ${isLight ? 'text-slate-700' : 'text-white'}`} />
                  </button>
                )}
              </div>
            )}
	          />
	        </Sheet.Header>
        <SmoothSheetContent>
          <ProgressWatcher onSheetProgressRef={onSheetProgressRef} onHomeProgressRef={onHomeProgressRef} />
	        <MapSheetBody peek>
	          <div
	            ref={scrollRef}
	            className={`flex-1 pb-12 ${snapIdx === HOME_LAST_SNAP ? 'overflow-y-auto' : 'overflow-hidden'}`}
	          >
	            <div className="px-5 pt-3 space-y-7">
              <section>
                {nearby[0] && (
                  <div
                    className={`truncate px-1 pb-5 text-[0.9375rem] font-normal ${titleClass}`}
                    style={isLight ? { color: '#0f172a' } : undefined}
                  >
                    {text.nearPrefix} {nearby[0].stop.name}
                  </div>
                )}
                {nearby.length === 0 ? (
                  <div className={`rounded-[28px] p-6 text-center ${surfaceClass}`}>
                    <p className={`text-sm font-semibold ${titleClass}`}>{nearbyOrigin ? text.noStopsNearby : text.noLocation}</p>
                    <p className={`mt-1 text-sm ${mutedClass}`}>{nearbyOrigin ? text.noStopsNearbyHint : text.noLocationHint}</p>
                  </div>
                ) : (
                  <NearbyDepartures
                    nearby={nearby}
                    active={isOpen && !locked}
                    language={language}
                    isLight={isLight}
                    titleClass={titleClass}
                    mutedClass={mutedClass}
                    onStopClick={onStopClick}
                    onReady={openOnceNearbyReady}
                    pending={originSettling && nearby.length === 0}
                  />
                )}
              </section>

            </div>
          </div>
        </MapSheetBody>
        </SmoothSheetContent>
      </MapSheetShell>
      <SheetBackdrop onTap={collapseToMini} snapIdx={snapIdx} />

    </Sheet>
  );
};

function ProgressWatcher({
  onSheetProgressRef,
  onHomeProgressRef,
}: {
  onSheetProgressRef: React.MutableRefObject<((p: number) => void) | undefined>;
  onHomeProgressRef: React.MutableRefObject<((p: number) => void) | undefined>;
}) {
  useEffect(() => {
    let rafId = 0;
    let lastProgress = -1;
    let lastHome = -1;

    const tick = () => {
      const containers = document.getElementsByClassName('react-modal-sheet-container');
      if (containers.length > 0) {
        const vh = window.innerHeight;
        let visibleHeight = 0;
        for (const container of Array.from(containers)) {
          const rect = (container as HTMLElement).getBoundingClientRect();
          if (rect.height === 0) continue;
          visibleHeight = Math.max(visibleHeight, vh - rect.top);
        }
        const progress = Math.min(1, Math.max(0, visibleHeight / vh));
        if (Math.abs(progress - lastProgress) > 0.001) {
          lastProgress = progress;
          onSheetProgressRef.current?.(progress);
        }
        const home = document.getElementById(HOME_SHEET_ID);
        const homeRect = home?.getBoundingClientRect();
        const homeShown = Boolean(homeRect && homeRect.height > 0 && homeRect.top < vh - 1);
        const homeProgress = homeShown ? Math.min(1, Math.max(0, (vh - homeRect!.top) / vh)) : lastHome;
        if (homeShown && Math.abs(homeProgress - lastHome) > 0.001) {
          lastHome = homeProgress;
          onHomeProgressRef.current?.(homeProgress);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onSheetProgressRef, onHomeProgressRef]);

  return null;
}
