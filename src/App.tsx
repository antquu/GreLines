import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { SignalIcon, MagnifyingGlassIcon, ExclamationTriangleIcon, MapPinIcon, Cog6ToothIcon, KeyIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { Map as TransitMap, Sidebar, SetupOverlay } from './components';
import { SearchBarMobile } from './components/SearchBarMobile';
import { TrafficPanelMobile } from './components/TrafficPanelMobile';
import { SidebarMobile } from './components/SidebarMobile';
import { getStopDetail, getStopLines, getStopsByPrefixes, getTrafficLines, getDepartures } from './services/api';
import type { Stop, StopDetail, TrafficDetail } from './types';
import type { MapRef } from './components/Map';

const accentColors: Record<'blue' | 'green' | 'orange' | 'purple' | 'pink', string> = {
  blue: '#3b82f6',
  green: '#10b981',
  orange: '#f97316',
  purple: '#8b5cf6',
  pink: '#ec4899',
};

function App() {
  const [stops, setStops] = useState<Stop[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [selectedStop, setSelectedStop] = useState<StopDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [initialSelectedLines, setInitialSelectedLines] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  const [signalColor, setSignalColor] = useState(true);
  const [trafficInfo, setTrafficInfo] = useState<Map<string, TrafficDetail[]>>(new Map());
  const [isTrafficButtonHovered, setIsTrafficButtonHovered] = useState(false);
  const [isTrafficPanelHovered, setIsTrafficPanelHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lon: number} | null>(null);
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);
  const [searchHistoryItems, setSearchHistoryItems] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('greLines_searchHistoryItems');
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [isTrafficPanelOpenMobile, setIsTrafficPanelOpenMobile] = useState(false);
  const [sidebarState, setSidebarState] = useState<'closed' | 'peek' | 'open'>('closed');

  const [activeSettingsTab, setActiveSettingsTab] = useState('general');
  const [settingsState, setSettingsState] = useState<'closed' | 'peek' | 'open'>('closed');
  const isSettingsOpen = settingsState !== 'closed';
  const settingsContentRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const [appData, setAppData] = useState<{version: string; credits: Array<{role: string; name: string; link?: string}>; admin?: {identifiers: Array<{user: string; password: string}>}} | null>(null);
  const [isLoginPage, setIsLoginPage] = useState(window.location.pathname === '/login');
  const [loginLangMenuOpen, setLoginLangMenuOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginShowPassword, setLoginShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginIsLoading, setLoginIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [_sessionToken, setSessionToken] = useState<string | null>(null);
  const [_sessionExpiry, setSessionExpiry] = useState<number | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  useEffect(() => {
    const onPopState = () => setIsLoginPage(window.location.pathname === '/login');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const [language, setLanguage] = useState<'fr' | 'en'>(() => {
    const saved = localStorage.getItem('greLines_language');
    return saved === 'en' ? 'en' : 'fr';
  });
  const [showSetup, setShowSetup] = useState(() => localStorage.getItem('greLines_setup_complete') !== 'true');
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(() => {
    return 'dark';
  });
  const accentColor = 'blue';
  const [fontSize, setFontSize] = useState<'small' | 'normal' | 'large'>(() => {
    return (localStorage.getItem('greLines_fontSize') as any) || 'normal';
  });
  const [compactMode, setCompactMode] = useState(() => {
    return localStorage.getItem('greLines_compactMode') === 'true';
  });
  const [refreshInterval, setRefreshInterval] = useState<'15s' | '30s' | '1m' | '2m'>(() => {
    return (localStorage.getItem('greLines_refreshInterval') as any) || '30s';
  });
  const [searchHistory, setSearchHistory] = useState(() => {
    return localStorage.getItem('greLines_searchHistory') !== 'false';
  });
  const [autoSync, setAutoSync] = useState(() => {
    return localStorage.getItem('greLines_autoSync') !== 'false';
  });
  const [autoLocation, setAutoLocation] = useState(() => {
    return localStorage.getItem('greLines_autoLocation') === 'true';
  });

  const isSidebarOpen = sidebarState !== 'closed';

  // Apply theme to document
  useLayoutEffect(() => {
    localStorage.setItem('greLines_theme', theme);
    const root = document.documentElement;
    const body = document.body;

    const applyMode = (isDark: boolean) => {
      root.classList.toggle('dark', isDark);
      body.classList.toggle('dark', isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
      body.style.colorScheme = isDark ? 'dark' : 'light';
    };

    const prefersDarkMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const updateThemeMode = (prefersDark: boolean) => {
      if (theme === 'auto') {
        applyMode(prefersDark);
      } else {
        applyMode(theme === 'dark');
      }
    };

    updateThemeMode(prefersDarkMedia.matches);

    const handlePrefersColorSchemeChange = (event: MediaQueryListEvent) => {
      if (theme === 'auto') {
        applyMode(event.matches);
      }
    };

    const mediaQueryList = prefersDarkMedia as any;

    mediaQueryList.addEventListener?.('change', handlePrefersColorSchemeChange);
    mediaQueryList.addListener?.(handlePrefersColorSchemeChange);

    return () => {
      mediaQueryList.removeEventListener?.('change', handlePrefersColorSchemeChange);
      mediaQueryList.removeListener?.(handlePrefersColorSchemeChange);
    };
  }, [theme]);

  // Handle sidebar close
  const handleSidebarClose = useCallback(() => {
    setSidebarState('closed');
    setSelectedStop(null);
  }, []);

  // Handle sidebar open fully
  const handleSidebarOpen = useCallback(() => {
    setSidebarState('open');
  }, []);

  const isTrafficPanelOpen = isTrafficButtonHovered || isTrafficPanelHovered;

  const mapRef = useRef<MapRef>(null);

  // Detect mobile viewport changes
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (settingsState === 'closed') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        setSettingsState('closed');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsState]);

  useEffect(() => {
    if (settingsState !== 'peek' || !settingsPanelRef.current) return;

    const panelDiv = settingsPanelRef.current;
    let hasInteracted = false;

    const handleInteraction = () => {
      if (!hasInteracted) {
        hasInteracted = true;
        setSettingsState('open');
      }
    };

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLDivElement;
      if (target.scrollTop > 10) {
        setSettingsState('open');
      }
    };

    panelDiv.addEventListener('click', handleInteraction);
    panelDiv.addEventListener('touchstart', handleInteraction);
    if (settingsContentRef.current) {
      settingsContentRef.current.addEventListener('scroll', handleScroll);
    }

    return () => {
      panelDiv.removeEventListener('click', handleInteraction);
      panelDiv.removeEventListener('touchstart', handleInteraction);
      if (settingsContentRef.current) {
        settingsContentRef.current.removeEventListener('scroll', handleScroll);
      }
    };
  }, [settingsState]);

  const normalizeStopId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (/^SEM:/.test(id)) return id;
    return `SEM:${id}`;
  };

  const applyConfigFromParams = async (params: URLSearchParams) => {
    const selectedLinesFromUrl = new Set<string>();
    let targetStopId: string | null = null;

    params.forEach((value, key) => {
      if (key.startsWith('T')) {
        if (value.startsWith('ALL_')) {
          const stopId = value.substring(4);
          if (stopId && !targetStopId) targetStopId = stopId;
        } else if (value.includes('_')) {
          const [lineId, stopId] = value.split('_');
          if (lineId) selectedLinesFromUrl.add(lineId);
          if (!targetStopId && stopId) targetStopId = stopId;
        }
      }
    });

    if (selectedLinesFromUrl.size > 0) {
      setInitialSelectedLines(selectedLinesFromUrl);
    }

    if (targetStopId && stops.length > 0) {
      const normalizedId = normalizeStopId(targetStopId);
      const targetStop = stops.find(stop => normalizeStopId(stop.id) === normalizedId);
      if (targetStop) {
        try {
          const stopDetail = await getStopDetail(targetStop.id);
          if (stopDetail) {
            setSelectedStop(stopDetail);
            setSidebarState('open');
            if (mapRef.current) {
              mapRef.current.centerOnStop(targetStop);
            }
          }
        } catch (err) {
          console.error('Failed to load stop from URL:', err);
        }
      }
    }
  };

  const parseConfigString = async (configUrl: string) => {
    try {
      const url = configUrl.startsWith('http')
        ? new URL(configUrl)
        : new URL(configUrl, window.location.origin);
      await applyConfigFromParams(url.searchParams);
    } catch (err) {
      const q = configUrl.split('?')[1];
      if (!q) return;
      const params = new URLSearchParams(q);
      await applyConfigFromParams(params);
    }
  };


  // Parse URL parameters and apply filters automatically
  useEffect(() => {
    applyConfigFromParams(new URLSearchParams(window.location.search));
  }, [stops]);

  // Listen for clipboard paste config strings
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const pastedText = e.clipboardData?.getData('text')?.trim();
      if (!pastedText) return;

      if (pastedText.includes('?T')) {
        parseConfigString(pastedText);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [stops]);

  // Load app data from JSON
  useEffect(() => {
    fetch('/grelines.json')
      .then(response => response.json())
      .then(data => setAppData(data))
      .catch(error => console.error('Failed to load app data:', error));
  }, []);

  // Check session validity on mount and periodically
  useEffect(() => {
    const checkSession = () => {
      const storedToken = localStorage.getItem('greLines_sessionToken');
      const storedExpiry = localStorage.getItem('greLines_sessionExpiry');

      if (storedToken && storedExpiry) {
        const expiryTime = parseInt(storedExpiry, 10);
        const now = Date.now();

        if (now < expiryTime) {
          // Session is still valid
          setSessionToken(storedToken);
          setSessionExpiry(expiryTime);
          setIsAuthenticated(true);
        } else {
          // Session has expired
          localStorage.removeItem('greLines_sessionToken');
          localStorage.removeItem('greLines_sessionExpiry');
          setSessionToken(null);
          setSessionExpiry(null);
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }

      setSessionChecked(true);
    };

    checkSession();

    // Check session every 5 seconds
    const sessionCheckInterval = setInterval(checkSession, 5000);
    return () => clearInterval(sessionCheckInterval);
  }, []);

  // Create session after successful login
  const createSession = () => {
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expiryTime = Date.now() + 30 * 60 * 1000; // 30 minutes from now

    localStorage.setItem('greLines_sessionToken', token);
    localStorage.setItem('greLines_sessionExpiry', expiryTime.toString());

    setSessionToken(token);
    setSessionExpiry(expiryTime);
    setIsAuthenticated(true);
  };

  // Redirect to login if accessing protected routes without auth,
  // and auto redirect /login to /admin/dashboard if already authenticated
  useEffect(() => {
    if (!sessionChecked) return;

    const currentPath = window.location.pathname;

    if (currentPath.startsWith('/admin')) {
      if (!isAuthenticated) {
        window.location.pathname = '/login';
      }
      return;
    }

    if (currentPath === '/login' && isAuthenticated) {
      window.location.pathname = '/admin/dashboard';
    }
  }, [isAuthenticated, sessionChecked]);

  // Fetch selected stops on mount or when the network selection changes
  useEffect(() => {
    let active = true;

    const fetchStops = async () => {
      try {
        setIsLoading(true);
        const stops = await getStopsByPrefixes(['SEM']);
        if (!active) return;
        setStops(stops);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError('Failed to load stops');
        console.error(err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    fetchStops();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('greLines_language', language);
  }, [language]);

  const translations = {
    fr: {
      searchPlaceholder: 'Rechercher un arr\u00eat...',
      recentSearch: 'Recherche r\u00e9cente',
      unknownCity: 'Ville inconnue',
      settings: {
        general: 'Param\u00e8tres g\u00e9n\u00e9raux',
        display: 'Affichage',
        data: 'Donn\u00e9es',
        about: '\u00c0 propos',
      },
      labels: {
        language: 'Langue',
        refreshInterval: 'Intervalle de rafra\u00eechissement',
        autoLocation: 'Centrer automatiquement',
        searchHistory: 'Historique de recherche',
        theme: 'Th\u00e8me',
        accentColor: 'Couleur accent',
        fontSize: 'Taille du texte',
        compactMode: 'Mode compact',
        autoSync: 'Actualisation automatique',
        clearCache: 'Effacer le cache et les donn\u00e9es',
        localStorageInfo: 'Param\u00e8tres et donn\u00e9es sont stock\u00e9s localement',
        noStops: 'Aucun arr\u00eat visible',
      },
      options: {
        refreshInterval: ['Toutes les 15s', 'Toutes les 30s', 'Toutes les 1 min', 'Toutes les 2 min'],
        theme: ['Automatique', 'Clair', 'Sombre'],
        fontSize: ['Petit', 'Normal', 'Grand'],
      },
      buttons: {
        clearCache: 'Effacer les donn\u00e9es',
      },
      misc: {
        settings: 'Param\u00e8tres',
        showTraffic: 'Voir le trafic',
        centerLocation: 'Centrer sur ma position',
        liveTrafficInfo: 'Infos trafic en direct',
        noIncidents: 'Aucun incident connu pour le moment.',
        linePrefix: 'Ligne',
        incidentSingular: 'incident',
        incidentPlural: 'incidents',
        endPrefix: 'Fin :',
        networkClosed: 'R\u00e9seau actuellement ferm\u00e9',
        localStorageTitle: 'Stockage local :',
        aboutDescription1: 'GreLines est une application web pour visualiser les arr\u00eats de transport en commun de Grenoble avec des informations de d\u00e9part en temps r\u00e9el.',
        aboutDescription2: 'Construit avec React, Tailwind CSS et Leaflet/MapTiler pour la cartographie.',
        versionLabel: 'Version :',
        dataSourceLabel: 'Source de donn\u00e9es :',
        designLabel: 'Design :',
        pleaseReload: 'Veuillez recharger la page.',
        calculateItineraryWith: 'Calculez votre itin\u00e9raire avec',
      },
      onboarding: {
        title: 'S\u00e9lectionnez vos r\u00e9seaux',
        description: 'Choisissez les op\u00e9rateurs \u00e0 afficher avant de charger la carte.',
        action: 'Voir les arr\u00eats',
        noSelection: 'S\u00e9lectionnez au moins un r\u00e9seau',
      },
      login: {
        title: 'Connexion',
        subtitle: 'GreLines Dashboard',
        email: 'Email',
        password: 'Mot de passe',
        submit: 'Se connecter',
        language: 'Langue',
        invalidEmail: 'Email invalide',
        invalidCredentials: 'L\'identifiant ou le mot de passe saisi est incorrect. Veuillez v\u00e9rifier et r\u00e9essayer.',
        backToHome: 'Retourner \u00e0 la page principale',
      }
    },
    en: {
      searchPlaceholder: 'Search for a stop...',
      recentSearch: 'Recent search',
      unknownCity: 'Unknown city',
      settings: {
        general: 'General Settings',
        display: 'Display Settings',
        data: 'Data & Sync',
        about: 'About',
      },
      labels: {
        language: 'Language',
        refreshInterval: 'Refresh Interval',
        autoLocation: 'Auto-center location',
        searchHistory: 'Search history',
        theme: 'Theme',
        accentColor: 'Accent color',
        fontSize: 'Font Size',
        compactMode: 'Compact mode',
        autoSync: 'Auto-sync departures',
        clearCache: 'Clear cache & data',
        localStorageInfo: 'Settings and data are saved locally',
        noStops: 'No stops visible',
      },
      options: {
        refreshInterval: ['Every 15s', 'Every 30s', 'Every 1 min', 'Every 2 min'],
        theme: ['Automatic', 'Light', 'Dark'],
        fontSize: ['Small', 'Normal', 'Large'],
      },
      buttons: {
        clearCache: 'Clear data',
      },
      misc: {
        settings: 'Settings',
        showTraffic: 'Show traffic info',
        centerLocation: 'Center on my location',
        liveTrafficInfo: 'Live traffic info',
        noIncidents: 'No known incidents at the moment.',
        linePrefix: 'Line',
        incidentSingular: 'incident',
        incidentPlural: 'incidents',
        endPrefix: 'End :',
        networkClosed: 'NETWORK CURRENTLY CLOSED',
        localStorageTitle: 'Local storage:',
        aboutDescription1: 'GreLines is a web application for viewing Grenoble public transport stops with real-time departure information.',
        aboutDescription2: 'Built with React, Tailwind CSS, and Leaflet/MapTiler mapping.',
        versionLabel: 'Version:',
        dataSourceLabel: 'Data source:',
        designLabel: 'Design:',
        pleaseReload: 'Please reload the page.',
        calculateItineraryWith: 'Calculate your itinerary with',
      },
      onboarding: {
        title: 'Select your networks',
        description: 'Choose the operators to show before loading the map.',
        action: 'Show stops',
        noSelection: 'Pick at least one network',
      },
      login: {
        title: 'Sign in',
        subtitle: 'GreLines Dashboard',
        email: 'Email',
        password: 'Password',
        submit: 'Sign in',
        language: 'Language',
        invalidEmail: 'Invalid email',
        invalidCredentials: 'The identifier or password entered is incorrect. Please verify and try again.',
        backToHome: 'Return to main page',
      }
    }
  } as const;

  const text = translations[language];

  const handleSetupComplete = (setupLanguage: 'fr' | 'en') => {
    localStorage.setItem('greLines_setup_complete', 'true');
    setShowSetup(false);
    setLanguage(setupLanguage);
    setTheme('dark');
    localStorage.setItem('greLines_language', setupLanguage);
    localStorage.setItem('greLines_theme', 'dark');
  };

  const isSetupVisible = showSetup && !isLoginPage;
  const hidePageControls = isSetupVisible;


  const isLoadingOverlayVisible = !isSetupVisible && isLoading;

  // Email validation function
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginIsLoading(true);

    // Validate email
    if (!loginEmail.trim()) {
      setLoginError(text.login.invalidEmail);
      setLoginIsLoading(false);
      return;
    }

    if (!isValidEmail(loginEmail)) {
      setLoginError(text.login.invalidEmail);
      setLoginIsLoading(false);
      return;
    }

    // Find user in appData
    if (!appData?.admin?.identifiers) {
      setLoginError(text.login.invalidCredentials);
      setLoginIsLoading(false);
      return;
    }

    const user = appData.admin.identifiers.find(
      (id: any) => id.user === loginEmail
    );

    if (!user) {
      setLoginError(text.login.invalidCredentials);
      setLoginIsLoading(false);
      return;
    }

    // Check password
    if (user.password !== loginPassword) {
      setLoginError(text.login.invalidCredentials);
      setLoginIsLoading(false);
      return;
    }

    // Success - create session and redirect to admin dashboard
    createSession();
    setLoginIsLoading(false);
    setTimeout(() => {
      window.location.pathname = '/admin/dashboard';
    }, 100);
  };

  if (isLoginPage) {
    return (
      <div
        className="min-h-screen bg-cover bg-center"
        style={{ backgroundImage: 'url(/assets/background/login.png)' }}
      >
        <div className="min-h-screen bg-black/60 flex flex-col items-center justify-center p-4 gap-4">
          {loginError && (
            <div className={`w-full max-w-md rounded-lg bg-red-100 border border-red-300 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400 transition-all duration-300 ease-out ${loginError ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
              {loginError}
            </div>
          )}
          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white/95 p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-900/95">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-4">{text.login.title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-300 mb-10">{text.login.subtitle}</p>
            <form className="space-y-4" onSubmit={handleLoginSubmit}>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{text.login.email}</label>
                <div className="relative">
                  <input 
                    type="email" 
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value);
                      setLoginError('');
                    }}
                    placeholder="user@example.com"
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 dark:bg-slate-800 dark:text-white dark:placeholder-slate-400 pr-10 ${
                      loginEmail && !isValidEmail(loginEmail)
                        ? 'border-red-400 focus:ring-red-500 dark:border-red-600'
                        : 'border-gray-300 focus:ring-blue-500 dark:border-slate-600'
                    }`}
                  />
                  {loginEmail && !isValidEmail(loginEmail) && (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-red-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0V12a9 9 0 11-18 0" />
                    </svg>
                  )}
                  {loginEmail && isValidEmail(loginEmail) && (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{text.login.password}</label>
                <div className="relative">
                  <input 
                    type={loginShowPassword ? "text" : "password"} 
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      setLoginError('');
                      setLoginShowPassword(false);
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setLoginShowPassword(!loginShowPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    {loginShowPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.87 9.87" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <button 
                type="submit" 
                disabled={loginIsLoading}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loginIsLoading ? '...' : text.login.submit}
              </button>
            </form>
          </div>

          <button
            onClick={() => window.location.pathname = '/'}
            className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700 flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            {text.login.backToHome}
          </button>

          <div className="fixed bottom-4 right-4 z-50">
            <div
              className="absolute bottom-14 right-0 overflow-hidden rounded-lg border border-gray-300 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800 transition-all duration-300"
              style={{ width: '180px', maxHeight: loginLangMenuOpen ? '100px' : '0', opacity: loginLangMenuOpen ? 1 : 0, transform: loginLangMenuOpen ? 'translateY(0)' : 'translateY(10px)' }}
            >
              <button
                onClick={() => { setLanguage('fr'); setLoginLangMenuOpen(false); }}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-700 ${language === 'fr' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-gray-200'}`}
              >
                <div className="flex items-center gap-2">
                  {language === 'fr' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="h-4 w-4" />
                  )}
                  Français
                </div>
              </button>
              <button
                onClick={() => { setLanguage('en'); setLoginLangMenuOpen(false); }}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-700 ${language === 'en' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-gray-200'}`}
              >
                <div className="flex items-center gap-2">
                  {language === 'en' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="h-4 w-4" />
                  )}
                  English
                </div>
              </button>
            </div>
            <button
              onClick={() => setLoginLangMenuOpen(prev => !prev)}
              className="relative flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-lg hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM12 3v3m0 12v3m9-9h-3M6 12H3m13.657-6.657l-2.121 2.121M8.464 15.536l-2.121 2.121m12.02 0l-2.121-2.121M8.464 8.464L6.343 6.343" />
              </svg>
              {text.login.language}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Set default accent color
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColors[accentColor]);
  }, []);

  // Apply font size to document
  useEffect(() => {
    localStorage.setItem('greLines_fontSize', fontSize);
    const root = document.documentElement;
    root.classList.remove('text-size-small', 'text-size-large');
    if (fontSize === 'small') {
      root.classList.add('text-size-small');
    } else if (fontSize === 'large') {
      root.classList.add('text-size-large');
    }
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('greLines_compactMode', compactMode ? 'true' : 'false');
  }, [compactMode]);

  useEffect(() => {
    localStorage.setItem('greLines_refreshInterval', refreshInterval);
  }, [refreshInterval]);

  useEffect(() => {
    localStorage.setItem('greLines_searchHistory', searchHistory ? 'true' : 'false');
  }, [searchHistory]);

  useEffect(() => {
    localStorage.setItem('greLines_searchHistoryItems', JSON.stringify(searchHistoryItems));
  }, [searchHistoryItems]);

  useEffect(() => {
    localStorage.setItem('greLines_autoSync', autoSync ? 'true' : 'false');
  }, [autoSync]);

  useEffect(() => {
    localStorage.setItem('greLines_autoLocation', autoLocation ? 'true' : 'false');
  }, [autoLocation]);

  // Fetch live traffic info for the new inset panel
  useEffect(() => {
    const fetchTraffic = async () => {
      try {
        const data = await getTrafficLines();
        setTrafficInfo(data);
      } catch (err) {
        console.error('Failed to load traffic info:', err);
      }
    };

    fetchTraffic();
  }, []);

  // Update time every second - this updates footer timestamp or closed status.
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      setSignalColor(prev => !prev);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const isNetworkClosed = (date: Date) => {
    const totalMinutes = date.getHours() * 60 + date.getMinutes();
    return totalMinutes >= 60 && totalMinutes < 270; // 01:00 \u00e0 04:30
  };

  // Handle stop click - memoized so Map doesn't re-render inutilement.
  const handleStopClick = useCallback(async (stop: Stop) => {
    try {
      if (searchHistory) {
        setSearchHistoryItems(prev => {
          const next = [stop.name, ...prev.filter(item => item !== stop.name)];
          return next.slice(0, 10);
        });
      }

      const placeholder: StopDetail = {
        ...stop,
        lines: [],
        departures: [],
        lastUpdate: new Date(),
      };

      setSelectedStop(placeholder);
      mapRef.current?.centerOnStop(stop);
      setSidebarState('peek');

      const lines = await getStopLines(stop.id);
      setSelectedStop(prev => prev ? { ...prev, lines } : { ...placeholder, lines });

      const departures = await getDepartures(stop.id);
      setSelectedStop(prev => prev ? { ...prev, departures, lastUpdate: new Date() } : { ...placeholder, departures, lines });
    } catch (err) {
      console.error('Failed to fetch stop details:', err);
    }
  }, [searchHistory, searchQuery]);

  // Handle location button click
  const handleLocationClick = useCallback(() => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ lat: latitude, lon: longitude });
        mapRef.current?.centerOnLocation(latitude, longitude);
      },
      (error) => {
        console.error('Error getting location:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000,
      }
    );

    if (locationWatchId !== null) {
      navigator.geolocation.clearWatch(locationWatchId);
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ lat: latitude, lon: longitude });
      },
      (error) => {
        console.error('Error watching location:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000,
      }
    );

    setLocationWatchId(watchId);
  }, [locationWatchId]);

  useEffect(() => {
    if (!autoLocation || !navigator.geolocation || !isMobile) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ lat: latitude, lon: longitude });
        mapRef.current?.centerOnLocation(latitude, longitude);
      },
      (error) => {
        console.error('Error getting initial location:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );

    setLocationWatchId(watchId);
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [autoLocation, isMobile]);

  const matchedStops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    return stops.filter((stop) =>
      stop.name.toLowerCase().includes(q) ||
      (stop.city?.toLowerCase().includes(q) ?? false) ||
      stop.id.toLowerCase().includes(q)
    );
  }, [searchQuery, stops]);

  const parseRefreshInterval = (interval: string): number => {
    switch (interval) {
      case '15s':
        return 15000;
      case '1m':
        return 60000;
      case '2m':
        return 120000;
      default:
        return 30000;
    }
  };

  const mapElement = useMemo(() => {
    return (
      <TransitMap
        ref={mapRef}
        stops={stops}
        selectedStop={selectedStop}
        currentLocation={currentLocation}
        onStopClick={handleStopClick}
      />
    );
  }, [stops, selectedStop, currentLocation, handleStopClick]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-white dark:bg-gray-950">
      {/* Full-screen Map */}
      <div className="absolute inset-0 z-0">
        {isLoadingOverlayVisible ? (
          <div className="fixed inset-0 z-[9999] h-screen w-screen flex flex-col items-center justify-center bg-black bg-opacity-95 pointer-events-auto">
            {/* Logo GreLines au milieu */}
            <div className="flex-1 flex items-center justify-center">
              <img
                src="/assets/GreLinesLOGO.png"
                alt="GreLines Loading"
                className="w-80 h-auto animate-pulse-opacity"
              />
            </div>

            {/* Logo M-Reso en bas */}
            <div className="pb-16">
              <img
                src="/assets/M-Reso.png"
                alt="M-Reso"
                className="w-28 h-auto"
              />
            </div>
          </div>
        ) : !isSetupVisible && error ? (
          <div className="h-full flex items-center justify-center bg-red-50 dark:bg-red-950">
            <div className="text-center">
              <svg
                className="h-12 w-12 text-red-600 mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4v2m0 0v2m0-6v-2m0 0V7a2 2 0 012-2h2.586a1 1 0 00.707-.293l-2.414-2.414a1 1 0 00-1.414 1.414L10.586 7H8a2 2 0 00-2 2v2m0 0H4m0 0v2a2 2 0 002 2h2v2m0 0v2a2 2 0 002 2h2m0 0h2a2 2 0 002-2v-2m0 0V9"
                />
              </svg>
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        ) : (
          mapElement
        )}
      </div>

      <SetupOverlay isVisible={isSetupVisible} onComplete={handleSetupComplete} />

      {/* Settings Modal */}
      {isSettingsOpen && (
        <>
          {/* Mobile Version */}
          {isMobile ? (
            <>
              {/* Full-screen overlay - only show when fullscreen */}
              {settingsState === 'open' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSettingsState('closed')}
                  className="fixed inset-0 bg-black/50 z-45"
                />
              )}

              {/* Settings panel */}
              <motion.div
                ref={settingsPanelRef}
                initial={{ y: '100%', opacity: 0 }}
                animate={{
                  y: settingsState === 'peek' ? '50%' : 0,
                  opacity: 1,
                  height: settingsState === 'open' ? '100vh' : '50vh'
                }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl border-t border-gray-200 dark:border-slate-600 overflow-hidden flex flex-col"
              >
                {/* Header with tabs */}
                <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-600 flex items-center justify-between px-4 py-3 flex-shrink-0">
                  <div className="flex space-x-1 overflow-x-auto scrollbar-hide relative" style={{ scrollBehavior: 'smooth' }}>
                    {[
                      { key: 'general', label: text.settings.general },
                      { key: 'display', label: text.settings.display },
                      { key: 'data', label: text.settings.data },
                      { key: 'about', label: text.settings.about }
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveSettingsTab(tab.key)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition flex-shrink-0 ${
                          activeSettingsTab === tab.key
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                    {/* Scroll indicator */}
                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-slate-900 to-transparent pointer-events-none opacity-60" />
                  </div>
                  <button
                    onClick={() => setSettingsState('closed')}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition ml-2 flex-shrink-0"
                    aria-label="Close settings"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                <div
                  ref={settingsContentRef}
                  className={`flex-1 overflow-y-auto p-4 ${settingsState === 'open' ? 'max-h-[calc(100vh-80px)]' : 'max-h-[calc(50vh-80px)]'}`}
                >
                  {activeSettingsTab === 'general' && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{text.settings.general}</h3>
                      <div className="space-y-4">
                        {/* Language */}
                        <div className="flex items-center justify-between py-2">
                          <label htmlFor="language-select-mobile" className="text-sm text-gray-700 dark:text-gray-300">
                            {text.labels.language}
                          </label>
                          <select
                            id="language-select-mobile"
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as 'fr' | 'en')}
                            className="settings-select w-32 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100"
                          >
                            <option value="fr">Français</option>
                            <option value="en">English</option>
                          </select>
                        </div>

                        {/* Refresh Interval */}
                        <div className="flex items-center justify-between py-2">
                          <label htmlFor="refresh-select-mobile" className="text-sm text-gray-700 dark:text-gray-300">
                            {text.labels.refreshInterval}
                          </label>
                          <select
                            id="refresh-select-mobile"
                            value={refreshInterval}
                            onChange={(e) => setRefreshInterval(e.target.value as any)}
                            className="settings-select w-40 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100"
                          >
                            <option value="15s">{text.options.refreshInterval[0]}</option>
                            <option value="30s">{text.options.refreshInterval[1]}</option>
                            <option value="1m">{text.options.refreshInterval[2]}</option>
                            <option value="2m">{text.options.refreshInterval[3]}</option>
                          </select>
                        </div>

                        {/* Auto Location */}
                        <div className="flex items-center justify-between py-2">
                          <label className="text-sm text-gray-700 dark:text-gray-300">{text.labels.autoLocation}</label>
                          <button
                            onClick={() => setAutoLocation(!autoLocation)}
                            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                              autoLocation ? '' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                            style={autoLocation ? { backgroundColor: accentColors[accentColor] } : undefined}
                          >
                            <div className={`w-5 h-5 bg-white rounded-full transition-transform ml-0.5 mt-0.5 ${
                              autoLocation ? 'translate-x-6' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>

                        {/* Search History */}
                        <div className="flex items-center justify-between py-2">
                          <label className="text-sm text-gray-700 dark:text-gray-300">{text.labels.searchHistory}</label>
                          <button
                            onClick={() => setSearchHistory(!searchHistory)}
                            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                              searchHistory ? '' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                            style={searchHistory ? { backgroundColor: accentColors[accentColor] } : undefined}
                          >
                            <div className={`w-5 h-5 bg-white rounded-full transition-transform ml-0.5 mt-0.5 ${
                              searchHistory ? 'translate-x-6' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === 'display' && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{text.settings.display}</h3>
                      <div className="space-y-4">
                        {/* Theme */}
                        <div className="py-2">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {text.labels.theme}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {(['dark'] as const).map((option) => {
                              const labels = {
                                dark: text.options.theme[2],
                              };
                              const selected = theme === option;
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => setTheme(option)}
                                  className="group flex flex-col items-center gap-2 outline-none"
                                >
                                  <img
                                    src={`/assets/${option}${selected ? '-selectioned' : ''}.svg`}
                                    alt={labels[option]}
                                    className="h-16 w-16 object-contain"
                                  />
                                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 text-center">
                                    {labels[option]}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Light mode option is hidden for now; only auto and dark are available */}
                          <div className="mt-0" />
                        </div>

                        {/* Font Size */}
                        <div className="flex items-center justify-between py-2">
                          <label htmlFor="font-size-select-mobile" className="text-sm text-gray-700 dark:text-gray-300">
                            {text.labels.fontSize}
                          </label>
                          <select
                            id="font-size-select-mobile"
                            value={fontSize}
                            onChange={(e) => setFontSize(e.target.value as any)}
                            className="settings-select w-32 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100"
                          >
                            <option value="small">{text.options.fontSize[0]}</option>
                            <option value="normal">{text.options.fontSize[1]}</option>
                            <option value="large">{text.options.fontSize[2]}</option>
                          </select>
                        </div>

                        {/* Compact Mode */}
                        <div className="flex items-center justify-between py-2">
                          <label className="text-sm text-gray-700 dark:text-gray-300">{text.labels.compactMode}</label>
                          <button
                            onClick={() => setCompactMode(!compactMode)}
                            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                              compactMode ? '' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                            style={compactMode ? { backgroundColor: accentColors[accentColor] } : undefined}
                          >
                            <div className={`w-5 h-5 bg-white rounded-full transition-transform ml-0.5 mt-0.5 ${
                              compactMode ? 'translate-x-6' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === 'data' && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{text.settings.data}</h3>
                      <div className="space-y-4">
                        {/* Auto Sync */}
                        <div className="flex items-center justify-between py-2">
                          <label className="text-sm text-gray-700 dark:text-gray-300">{text.labels.autoSync}</label>
                          <button
                            onClick={() => setAutoSync(!autoSync)}
                            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                              autoSync ? '' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                            style={autoSync ? { backgroundColor: accentColors[accentColor] } : undefined}
                          >
                            <div className={`w-5 h-5 bg-white rounded-full transition-transform ml-0.5 mt-0.5 ${
                              autoSync ? 'translate-x-6' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>

                        {/* Clear Cache */}
                        <div className="pt-4 border-t border-gray-200 dark:border-slate-600">
                          <button
                            onClick={() => {
                              localStorage.clear();
                              alert(`${text.buttons.clearCache}. ${text.misc.pleaseReload}`);
                              window.location.reload();
                            }}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 dark:bg-red-700 dark:hover:bg-red-800 text-white text-sm rounded-lg transition font-medium w-full"
                          >
                            {text.buttons.clearCache}
                          </button>
                        </div>

                        {/* Storage Info */}
                        <div className="pt-4 border-t border-gray-200 dark:border-slate-600">
                          <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                            <strong>{text.misc.localStorageTitle}</strong> {text.labels.localStorageInfo}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {text.labels.localStorageInfo}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === 'about' && (
                    <div className="flex flex-col min-h-full">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{text.settings.about}</h3>
                        <div className="space-y-4">
                          <div className="flex items-center justify-center mb-4">
                            <img src="/assets/GreLinesAssoLOGO.png" alt="GreLines" className="h-24 w-auto" />
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{text.misc.aboutDescription1}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{text.misc.aboutDescription2}</p>
                          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 pt-2">
                            <p><strong>{text.misc.versionLabel}</strong> {appData?.version || '1.0.0'}</p>
                            <p><strong>{text.misc.dataSourceLabel}</strong> MTAG API (Grenoble)</p>
                            {appData?.credits?.map((credit, index) => (
                              <p key={index}>
                                <strong>{credit.role}:</strong>{' '}
                                {credit.link ? (
                                  <a
                                    href={credit.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {credit.name}
                                  </a>
                                ) : (
                                  credit.name
                                )}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-gray-200 dark:border-slate-600 mt-6 pt-4">
                        <div className="flex items-center justify-center gap-2 w-full">
                          <a href="https://web-tag-express.vercel.app" target="_blank" rel="noopener noreferrer" className="flex-1 h-12 flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-sm hover:shadow-md transition">
                            <img src="/assets/GreGoLOGO.png" alt="GreGo" className="h-7 w-auto" />
                          </a>
                          <a href="https://github.com/antquu/GreLines" target="_blank" rel="noopener noreferrer" className="flex-1 h-12 flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-sm hover:shadow-md transition">
                            <img src="/assets/GitHubLOGO.png" alt="GitHub" className="h-7 w-auto" />
                            <span className="text-white text-xs">Project</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          ) : (
            /* Desktop Version */
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-md px-4 py-8">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -20 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="relative bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl max-w-3xl w-[85vw] max-h-[86vh] overflow-hidden backdrop-blur-sm"
              >
                <div className="flex h-[80vh] md:h-[70vh]">
                  {/* Mini Sidebar */}
                  <div className="w-44 bg-gray-50 dark:bg-slate-700 border-r border-gray-200 dark:border-slate-600">
                    <div className="flex items-start justify-start p-3">
                      <button
                        onClick={() => setSettingsState('closed')}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white bg-white/90 dark:bg-slate-800/90 border border-gray-300 dark:border-slate-600 shadow-sm"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-2 px-2">
                      <button
                        onClick={() => setActiveSettingsTab('general')}
                        className={`w-full text-left px-3 py-2 text-sm rounded-lg transition ${
                          activeSettingsTab === 'general'
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                        }`}
                      >
                        {text.settings.general}
                      </button>
                      <button
                        onClick={() => setActiveSettingsTab('display')}
                        className={`w-full text-left px-3 py-2 text-sm rounded-lg transition ${
                          activeSettingsTab === 'display'
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                        }`}
                      >
                        {text.settings.display}
                      </button>
                      <button
                        onClick={() => setActiveSettingsTab('data')}
                        className={`w-full text-left px-3 py-2 text-sm rounded-lg transition ${
                          activeSettingsTab === 'data'
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                        }`}
                      >
                        {text.settings.data}
                      </button>
                      <button
                        onClick={() => setActiveSettingsTab('about')}
                        className={`w-full text-left px-3 py-2 text-sm rounded-lg transition ${
                          activeSettingsTab === 'about'
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                        }`}
                      >
                        {text.settings.about}
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-4 flex flex-col overflow-hidden">
                    {activeSettingsTab === 'general' && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{text.settings.general}</h3>
                        <div className="space-y-3">
                          {/* Language */}
                          <div className="flex items-center justify-between py-2">
                            <label htmlFor="language-select" className="text-sm text-gray-700 dark:text-gray-300">
                              {text.labels.language}
                            </label>
                            <select
                              id="language-select"
                              value={language}
                              onChange={(e) => setLanguage(e.target.value as 'fr' | 'en')}
                              className="settings-select w-32 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100"
                            >
                              <option value="fr">Français</option>
                              <option value="en">English</option>
                            </select>
                          </div>

                          {/* Refresh Interval */}
                          <div className="flex items-center justify-between py-2">
                            <label htmlFor="refresh-select" className="text-sm text-gray-700 dark:text-gray-300">
                              {text.labels.refreshInterval}
                            </label>
                            <select
                              id="refresh-select"
                              value={refreshInterval}
                              onChange={(e) => setRefreshInterval(e.target.value as any)}
                              className="settings-select w-40 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100"
                            >
                              <option value="15s">{text.options.refreshInterval[0]}</option>
                              <option value="30s">{text.options.refreshInterval[1]}</option>
                              <option value="1m">{text.options.refreshInterval[2]}</option>
                              <option value="2m">{text.options.refreshInterval[3]}</option>
                            </select>
                          </div>

                          {/* Search History */}
                          <div className="flex items-center justify-between py-2">
                            <label className="text-sm text-gray-700 dark:text-gray-300">{text.labels.searchHistory}</label>
                            <button
                              onClick={() => setSearchHistory(!searchHistory)}
                              className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                                searchHistory ? '' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                              style={searchHistory ? { backgroundColor: accentColors[accentColor] } : undefined}
                            >
                              <div className={`w-5 h-5 bg-white rounded-full transition-transform ml-0.5 mt-0.5 ${
                                searchHistory ? 'translate-x-6' : 'translate-x-0'
                              }`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {activeSettingsTab === 'display' && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{text.settings.display}</h3>
                        <div className="space-y-3">
                          {/* Theme */}
                          <div className="py-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {text.labels.theme}
                              </span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              {(['dark'] as const).map((option) => {
                                const labels = {
                                  dark: text.options.theme[2],
                                };
                                const selected = theme === option;
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() => setTheme(option)}
                                    className="group flex flex-col items-center gap-2 outline-none"
                                  >
                                    <img
                                      src={`/assets/${option}${selected ? '-selectioned' : ''}.svg`}
                                      alt={labels[option]}
                                      className="h-20 w-20 object-contain"
                                    />
                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 text-center">
                                      {labels[option]}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Font Size */}
                          <div className="flex items-center justify-between py-2">
                            <label htmlFor="font-size-select" className="text-sm text-gray-700 dark:text-gray-300">
                              {text.labels.fontSize}
                            </label>
                            <select
                              id="font-size-select"
                              value={fontSize}
                              onChange={(e) => setFontSize(e.target.value as any)}
                              className="settings-select w-32 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100"
                            >
                              <option value="small">{text.options.fontSize[0]}</option>
                              <option value="normal">{text.options.fontSize[1]}</option>
                              <option value="large">{text.options.fontSize[2]}</option>
                            </select>
                          </div>

                          {/* Compact Mode */}
                          <div className="flex items-center justify-between py-2">
                            <label className="text-sm text-gray-700 dark:text-gray-300">{text.labels.compactMode}</label>
                            <button
                              onClick={() => setCompactMode(!compactMode)}
                              className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                                compactMode ? '' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                              style={compactMode ? { backgroundColor: accentColors[accentColor] } : undefined}
                            >
                              <div className={`w-5 h-5 bg-white rounded-full transition-transform ml-0.5 mt-0.5 ${
                                compactMode ? 'translate-x-6' : 'translate-x-0'
                              }`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {activeSettingsTab === 'data' && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{text.settings.data}</h3>
                        <div className="space-y-3">
                          {/* Auto Sync */}
                          <div className="flex items-center justify-between py-2">
                            <label className="text-sm text-gray-700 dark:text-gray-300">{text.labels.autoSync}</label>
                            <button
                              onClick={() => setAutoSync(!autoSync)}
                              className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                                autoSync ? '' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                              style={autoSync ? { backgroundColor: accentColors[accentColor] } : undefined}
                            >
                              <div className={`w-5 h-5 bg-white rounded-full transition-transform ml-0.5 mt-0.5 ${
                                autoSync ? 'translate-x-6' : 'translate-x-0'
                              }`} />
                            </button>
                          </div>

                          {/* Clear Cache */}
                          <div className="pt-3 border-t border-gray-200 dark:border-slate-600 mt-4">
                            <button
                              onClick={() => {
                                localStorage.clear();
                                alert(`${text.buttons.clearCache}. ${text.misc.pleaseReload}`);
                                window.location.reload();
                              }}
                              className="px-4 py-2 bg-red-500 hover:bg-red-600 dark:bg-red-700 dark:hover:bg-red-800 text-white text-sm rounded-lg transition font-medium"
                            >
                              {text.buttons.clearCache}
                            </button>
                          </div>

                          {/* Storage Info */}
                          <div className="pt-4 border-t border-gray-200 dark:border-slate-600">
                            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                              <strong>{text.misc.localStorageTitle}</strong> {text.labels.localStorageInfo}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {text.labels.localStorageInfo}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {activeSettingsTab === 'about' && (
                      <div className="flex flex-col h-full">
                        <div className="flex-1 overflow-auto pr-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{text.settings.about}</h3>
                          <div className="space-y-3">
                            <div className="flex items-center justify-center mb-4">
                              <img src="/assets/GreLinesAssoLOGO.png" alt="GreLines" className="h-28 w-auto" />
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{text.misc.aboutDescription1}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{text.misc.aboutDescription2}</p>
                            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 pt-2">
                              <p><strong>{text.misc.versionLabel}</strong> {appData?.version || '1.0.0'}</p>
                              <p><strong>{text.misc.dataSourceLabel}</strong> MTAG API (Grenoble)</p>
                              {appData?.credits?.map((credit, index) => (
                                <p key={index}>
                                  <strong>{credit.role}:</strong>{' '}
                                  {credit.link ? (
                                    <a
                                      href={credit.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                      {credit.name}
                                    </a>
                                  ) : (
                                    credit.name
                                  )}
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-gray-200 dark:border-slate-600 mt-4 pt-3">
                          <div className="flex items-center justify-center gap-2 w-full max-w-full" style={{ minHeight: '76px' }}>
                            <a href="https://web-tag-express.vercel.app" target="_blank" rel="noopener noreferrer" className="flex-1 h-12 flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-sm hover:shadow-md transition">
                              <img src="/assets/GreGoLOGO.png" alt="GreGo" className="h-8 w-auto" />
                            </a>
                            <a href="https://github.com/antquu/GreLines" target="_blank" rel="noopener noreferrer" className="flex-1 h-12 flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-sm hover:shadow-md transition">
                              <img src="/assets/GitHubLOGO.png" alt="GitHub" className="h-8 w-auto" />
                              <span className="text-white">Project</span>
                            </a>
                            <a href="/login" target="_blank" rel="noopener noreferrer" className="h-12 w-12 flex items-center justify-center bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-sm hover:shadow-md transition">
                              <KeyIcon className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </>
      )}

      {/* Search bar & Traffic Panel */}
      {!isLoading && (
        <>
          {isMobile && !hidePageControls && !isSidebarOpen && !isSettingsOpen && !isTrafficPanelOpenMobile && (
            <SearchBarMobile
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              matchedStops={matchedStops}
              searchHistoryItems={searchHistory ? searchHistoryItems : []}
              searchPlaceholder={text.searchPlaceholder}
              recentSearchLabel={text.recentSearch}
              unknownCityLabel={text.unknownCity}
              onStopClick={(stop) => {
                handleStopClick(stop);
                mapRef.current?.centerOnStop(stop);
              }}
              isFocused={isSearchFocused}
              onFocus={setIsSearchFocused}
              calculateItineraryWith={text.misc.calculateItineraryWith}
            />
          )}

          {isMobile && !hidePageControls && !isSidebarOpen && !isSettingsOpen && !isTrafficPanelOpenMobile && (
            <motion.button
                onClick={() => setSettingsState('peek')}
                className="fixed z-60 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer border-2 border-gray-300 dark:border-gray-700 bg-white/85 dark:bg-slate-900/85 hover:bg-white dark:hover:bg-slate-900 transition-all duration-300 ease-out shadow-lg"
                animate={{
                  top: '60px',
                  left: '16px',
                  scale: 1,
                  opacity: isSearchFocused ? 0 : 1
                }}
                initial={{ scale: 0, opacity: 0 }}
                transition={{
                  opacity: { duration: 0.3, ease: 'easeOut' },
                  default: { duration: 0 }
                }}
                title={text.misc.settings}
              >
                <Cog6ToothIcon className="w-5 h-5 text-black dark:text-white" />
              </motion.button>
          )}

          {isMobile && !hidePageControls && !isSidebarOpen && !isSettingsOpen && !isTrafficPanelOpenMobile && (
            <motion.button
                onClick={handleLocationClick}
                className="fixed z-60 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer border-2 border-gray-300 dark:border-gray-700 bg-white/85 dark:bg-slate-900/85 hover:bg-white dark:hover:bg-slate-900 transition-all duration-300 ease-out shadow-lg"
                animate={{
                  top: '104px',
                  left: '16px',
                  scale: 1,
                  opacity: isSearchFocused ? 0 : 1
                }}
                initial={{ scale: 0, opacity: 0 }}
                transition={{
                  opacity: { duration: 0.3, ease: 'easeOut' },
                  default: { duration: 0 }
                }}
                title={text.misc.centerLocation}
              >
                <MapPinIcon className="w-5 h-5 text-black dark:text-white" />
              </motion.button>
          )}

          {isMobile && !hidePageControls && !isSidebarOpen && !isSettingsOpen && !isTrafficPanelOpenMobile && (
            <motion.button
                onClick={() => setIsTrafficPanelOpenMobile(!isTrafficPanelOpenMobile)}
                className="fixed z-60 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer border-2 border-amber-600 bg-yellow-400 hover:bg-yellow-500 transition-all duration-300 ease-out shadow-lg"
                animate={{
                  top: '148px',
                  left: '16px',
                  scale: 1,
                  opacity: isSearchFocused ? 0 : 1
                }}
                initial={{ scale: 0, opacity: 0 }}
                transition={{
                  opacity: { duration: 0.3, ease: 'easeOut' },
                  default: { duration: 0 }
                }}
                title={text.misc.showTraffic}
              >
                <ExclamationTriangleIcon className="w-5 h-5 text-white" />
              </motion.button>
          )}

          {!hidePageControls && !isMobile && (
            <div className="fixed top-4 left-4 z-50 flex items-start gap-2">
              {/* Settings Button */}
              <button
                onClick={() => setSettingsState('open')}
                className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer bg-white/85 dark:bg-slate-900/85 hover:bg-white dark:hover:bg-slate-900 transition-all duration-300 ease-out shadow-lg"
                title={text.misc.settings}
              >
                <Cog6ToothIcon className="w-5 h-5 text-black dark:text-white" />
              </button>

              <div
                onMouseEnter={() => setIsSearchHovered(true)}
                onMouseLeave={() => setIsSearchHovered(false)}
                className={`relative h-10 transition-[width] duration-300 ease-out ${
                  isSearchFocused || isSearchHovered ? 'w-96' : 'w-10'
                } group`}
              >
                <div className="absolute inset-0 bg-white/85 dark:bg-slate-900/85 border border-gray-300 dark:border-gray-700 shadow-lg rounded-full transition-all duration-300" />

                <div className="relative h-full flex items-center pr-2">
                  <div
                    className={`absolute z-20 flex items-center justify-center h-full ${
                      isSearchFocused || isSearchHovered
                        ? 'left-5 -translate-x-0'
                        : 'left-1/2 -translate-x-1/2'
                    }`}
                  >
                    <MagnifyingGlassIcon className="w-5 h-5 text-black dark:text-white" />
                  </div>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                    placeholder={text.searchPlaceholder}
                    className="h-full pl-10 pr-4 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 transition-all duration-300 ease-out opacity-0 w-0 group-hover:opacity-100 group-hover:w-[calc(100%-48px)] focus:opacity-100 focus:w-[calc(100%-48px)]"
                    autoComplete="off"
                  />
                  {searchQuery && (isSearchFocused || isSearchHovered) && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                      type="button"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Zone de recherche dropdown */}
                {(isSearchFocused || isSearchHovered) && (
                  <div className="absolute left-0 top-12 mt-1 w-full max-h-72 overflow-auto bg-white/95 dark:bg-slate-900/95 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl">
                    {/* Résultats de recherche */}
                    {searchQuery.trim() !== '' && matchedStops.length > 0 && (
                      <>
                        {matchedStops.map((stop) => (
                          <button
                            key={stop.id}
                            onClick={() => {
                              handleStopClick(stop);
                              mapRef.current?.centerOnStop(stop);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
                          >
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{stop.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{stop.city || text.unknownCity}</div>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Historique de recherche */}
                    {searchQuery.trim() === '' && searchHistory && searchHistoryItems.length > 0 && (
                      <>
                        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                          Recherches récentes
                        </div>
                        {searchHistoryItems.map((historyItem, index) => (
                          <button
                            key={`${historyItem}-${index}`}
                            onClick={() => setSearchQuery(historyItem)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 transition flex items-center gap-2"
                          >
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-sm text-gray-900 dark:text-gray-100">{historyItem}</span>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Séparateur avec logo GreGo - toujours visible */}
                    <div className="border-t border-gray-200 dark:border-gray-600 px-3 py-3">
                      <a href="https://web-tag-express.vercel.app" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer">
                        <span>{text.misc.calculateItineraryWith}</span>
                        <img
                          src="/assets/GreGoLOGO.png"
                          alt="GreGo"
                          className="h-4 w-auto"
                        />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {!isMobile && (
                <div
                  onMouseEnter={() => setIsTrafficButtonHovered(true)}
                  onMouseLeave={() => setIsTrafficButtonHovered(false)}
                  className="relative z-50"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer border border-amber-600 transition-all duration-300 ${
                      isTrafficPanelOpen
                        ? 'w-96 h-72 rounded-2xl bg-amber-800 border-amber-700'
                        : 'bg-yellow-400'
                    }`}
                  >
                    <ExclamationTriangleIcon className="w-5 h-5 text-white" />

                    <div
                      onMouseEnter={() => setIsTrafficPanelHovered(true)}
                      onMouseLeave={() => setIsTrafficPanelHovered(false)}
                      className={`absolute top-0 left-0 z-50 transition-all duration-300 ease-out ${
                        isTrafficPanelOpen
                          ? 'opacity-100 pointer-events-auto'
                          : 'opacity-0 pointer-events-none'
                      }`}
                      style={{ width: '100%', height: '100%' }}
                    >
                      <div className="h-full w-full overflow-y-auto rounded-2xl border border-amber-600 bg-[#5c3d04] p-3 text-amber-50 shadow-2xl">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-200 mb-2">{text.misc.liveTrafficInfo}</h3>
                        {trafficInfo.size === 0 ? (
                          <div className="text-xs text-amber-200">{text.misc.noIncidents}</div>
                        ) : (
                          <div className="space-y-2">
                            {Array.from(trafficInfo.entries())
                            .filter(([line]) => {
                              const normalized = line.trim().toUpperCase();
                              if (['A', 'B', 'C', 'D', 'E'].includes(normalized)) return true;
                              if (normalized.startsWith('C')) {
                                const num = Number(normalized.substring(1));
                                return num >= 1 && num <= 14;
                              }
                              const numeric = Number(normalized);
                              return numeric >= 15 && numeric <= 92;
                            })
                            .map(([line, details]) => {
                              const sortedDetails = [...details].sort((a, b) => {
                                const at = new Date(a.dateFin).getTime() || 0;
                                const bt = new Date(b.dateFin).getTime() || 0;
                                return at - bt;
                              });

                              return (
                                <div key={line} className="rounded-md bg-amber-700/30 p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-amber-100">{text.misc.linePrefix} {line}</span>
                                    <span className="text-[10px] text-amber-200">{sortedDetails.length} {sortedDetails.length > 1 ? text.misc.incidentPlural : text.misc.incidentSingular}</span>
                                  </div>
                                  {sortedDetails.map((detail, index) => (
                                    <div key={`${line}-${index}`} className="text-xs text-amber-100 mt-1 border-t border-amber-600/50 pt-1">
                                      <div className="font-semibold">{detail.titre}</div>
                                      <div>{detail.description}</div>
                                      <div className="text-[11px] text-amber-200">{text.misc.endPrefix} {detail.dateFin || 'N/A'}</div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!hidePageControls && (
        <TrafficPanelMobile
          isOpen={isTrafficPanelOpenMobile}
          onClose={() => setIsTrafficPanelOpenMobile(false)}
          trafficInfo={trafficInfo}
          language={language}
        />
      )}

      {/* Sidebar - Desktop */}
      {!isMobile && (
        <Sidebar
          stop={selectedStop}
          isOpen={isSidebarOpen}
          onClose={handleSidebarClose}
          initialSelectedLines={initialSelectedLines}
          compactMode={compactMode}
          autoSync={autoSync}
          refreshIntervalMs={parseRefreshInterval(refreshInterval)}
          language={language}
        />
      )}

      {/* Sidebar - Mobile */}
      {isMobile && (
        <SidebarMobile
          stop={selectedStop}
          isOpen={isSidebarOpen}
          sidebarState={sidebarState}
          onClose={handleSidebarClose}
          onOpen={handleSidebarOpen}
          initialSelectedLines={initialSelectedLines}
          compactMode={compactMode}
          autoSync={autoSync}
          refreshIntervalMs={parseRefreshInterval(refreshInterval)}
          language={language}
        />
      )}

      {/* Overlay backdrop */}
      {sidebarState === 'open' && (
        <div
          className="fixed inset-0 bg-black/10 backdrop-blur-sm z-20 lg:hidden"
          onClick={handleSidebarClose}
        />
      )}

      {/* Footer - Live Time / Network Closed */}
      {!hidePageControls && (
        <div className="fixed bottom-0 left-0 right-0 h-10 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 shadow-lg">
        {isNetworkClosed(currentTime) ? (
          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-red-600 dark:text-red-300">
            {text.misc.networkClosed}
          </div>
        ) : (
          <div className="h-full flex items-center justify-between px-4">
            {/* Left: By Antquu */}
            <a
              href="https://github.com/antquu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-900 dark:text-white text-xs font-medium hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer"
            >
              By Antquu
            </a>

            {/* Right: Live Time */}
            <div className="flex items-center gap-1.5">
              <SignalIcon
                className={`w-4 h-4 transition-colors duration-300 ${
                  signalColor
                    ? 'text-blue-600'
                    : 'text-gray-900 dark:text-white'
                }`}
              />
              <p className="text-gray-900 dark:text-white font-mono font-medium text-xs">
                {currentTime.toLocaleTimeString('fr-FR')}
              </p>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

export default App;

