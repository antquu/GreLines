import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'

import './light-theme.css'
import { PerfSettingsProvider } from './hooks/usePerfSettings.tsx'
import { IS_NANCY } from './site'
import { installNetworkSimulation } from './services/networkSimulation'
import { preloadBadgeImages } from './utils/badgeImages'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

console.log(`_
  __ _ _ __ | |_ __ _ _ _
 / _\` | '_ \\| __/ _\` | | | |
| (_| | | | | || (_| | |_| |
 \\__,_|_| |_|\\__\\__, |\\__,_|
                   |_|

       made by antqu • github.com/antquu`
)

installNetworkSimulation()
preloadBadgeImages()

const root = createRoot(document.getElementById('root')!)

function deviceLang(): 'fr' | 'en' {
  const tags = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (const tag of tags) {
    const base = String(tag ?? '').toLowerCase().split('-')[0];
    if (base === 'fr') return 'fr';
    if (base === 'en') return 'en';
  }
  return 'fr';
}

const landingLang = (IS_NANCY ? undefined : /^\/(fr|en)\/?$/.exec(window.location.pathname)?.[1]) as
  | 'fr'
  | 'en'
  | undefined;

const legalRoute = /^\/(fr|en)\/legals\/([a-z-]+)\/?$/.exec(window.location.pathname);

const blogRoute = IS_NANCY ? null : /^\/(fr|en)\/(?:newsroom|blog)\/?$/.exec(window.location.pathname);
const docsRoute = IS_NANCY ? null : /^\/(fr|en)\/docs(?:\/([a-z0-9-]+))?(?:\/([a-z0-9-]+))?\/?$/.exec(
  window.location.pathname,
);
const solutionRoute = IS_NANCY ? null : /^\/(fr|en)\/solutions(?:\/([a-z0-9-]+))?\/?$/.exec(
  window.location.pathname,
);
const postRoute = IS_NANCY ? null : /^\/(fr|en)\/(?:newsroom|blog)\/([A-Za-z0-9-]+)\/?$/.exec(window.location.pathname);

const LANDING_LANG_KEY = 'greLines_landingLang';

if (solutionRoute) {
  void import('./landing/SolutionPage').then(({ SolutionPage }) => {
    root.render(
      <StrictMode>
        <SolutionPage lang={solutionRoute[1] as 'fr' | 'en'} slug={solutionRoute[2]} />
        <Analytics />
        <SpeedInsights />
      </StrictMode>,
    );
  });
} else if (docsRoute) {
  void import('./landing/DocsPage').then(({ DocsPage }) => {
    root.render(
      <StrictMode>
        <DocsPage
          lang={docsRoute[1] as 'fr' | 'en'}
          group={docsRoute[2]}
          entry={docsRoute[3]}
        />
        <Analytics />
        <SpeedInsights />
      </StrictMode>,
    );
  });
} else if (blogRoute) {
  void import('./landing/BlogPage').then(({ BlogIndex }) => {
    root.render(
      <StrictMode>
        <BlogIndex lang={blogRoute[1] as 'fr' | 'en'} />
        <Analytics />
        <SpeedInsights />
      </StrictMode>,
    );
  });
} else if (postRoute) {
  void import('./landing/BlogPage').then(({ BlogArticle }) => {
    root.render(
      <StrictMode>
        <BlogArticle lang={postRoute[1] as 'fr' | 'en'} slug={postRoute[2]} />
        <Analytics />
        <SpeedInsights />
      </StrictMode>,
    );
  });
} else if (legalRoute) {
  const [, legalLang, legalSlug] = legalRoute;
  void Promise.all([import('./landing/LegalPage'), import('./landing/legalContent')]).then(
    ([{ LegalPage }, { isLegalSlug }]) => {
      const slug = isLegalSlug(legalSlug) ? legalSlug : 'privacy-policy';
      root.render(
        <StrictMode>
          <LegalPage lang={legalLang as 'fr' | 'en'} slug={slug} />
          <Analytics />
          <SpeedInsights />
        </StrictMode>,
      );
    },
  );
} else if (landingLang) {
  let chosen: string | null = null;
  try { chosen = localStorage.getItem(LANDING_LANG_KEY); } catch { }

  const wanted = deviceLang();
  if (!chosen && wanted !== landingLang) {
    window.location.replace(`/${wanted}${window.location.search}${window.location.hash}`);
  }

  void import('./landing/LandingApp').then(({ LandingApp }) => {
    root.render(
      <StrictMode>
        <LandingApp lang={landingLang} />
        <Analytics />
        <SpeedInsights />
      </StrictMode>,
    )
  })
} else if (!IS_NANCY && /^\/(?:trafic|traffic)\/?$/.test(window.location.pathname)) {
  void import('./traffic/TrafficPage').then(({ TrafficPage }) => {
    root.render(
      <StrictMode>
        <TrafficPage />
        <Analytics />
        <SpeedInsights />
      </StrictMode>,
    )
  })
} else if (window.location.pathname.startsWith('/app/screen')) {
  void import('./screen/ScreenApp').then(({ ScreenApp }) => {
    root.render(
      <StrictMode>
        <ScreenApp />
        <Analytics />
        <SpeedInsights />
      </StrictMode>,
    )
  })
} else {
  void import('./App.tsx').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <PerfSettingsProvider>
          <App />
          <Analytics />
          <SpeedInsights />
        </PerfSettingsProvider>
      </StrictMode>,
    )
  })
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {

    })
  })
}
