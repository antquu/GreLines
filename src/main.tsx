import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'

import './light-theme.css'
import { PerfSettingsProvider } from './hooks/usePerfSettings.tsx'
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

const root = createRoot(document.getElementById('root')!)






/**
 * La vitrine, sur `/fr` et `/en` — et sur elles seules.
 *
 * Le routage se fait ici, avant tout le reste : `App` réécrit toute adresse
 * inconnue en `/app`, si bien qu'une vitrine montée à l'intérieur serait
 * renvoyée à l'application avant d'avoir paru. `/` continue donc de mener
 * droit à l'app, ce qui reste la porte d'entrée par défaut.
 */
/**
 * La langue de la page d'accueil.
 *
 * L'adresse commande : quelqu'un qui a suivi un lien vers `/en` veut l'anglais,
 * quelle que soit la langue de son téléphone. C'est la racine, `/`, qui laisse
 * la question ouverte — et là on répond avec l'appareil, en le renvoyant vers
 * l'adresse correspondante plutôt qu'en servant deux contenus sous la même
 * URL : une page traduite doit avoir sa propre adresse, sinon ni les moteurs
 * ni les liens partagés ne s'y retrouvent.
 */
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

const landingLang = /^\/(fr|en)\/?$/.exec(window.location.pathname)?.[1] as
  | 'fr'
  | 'en'
  | undefined;

/**
 * Les pages légales, sous `/fr/legals/...` et `/en/legals/...`.
 *
 * L'adresse du document est la même dans les deux langues : un lien vers la
 * politique de confidentialité se colle dans un courriel ou dans un formulaire
 * de magasin d'applications, et il vaut mieux qu'il désigne le même texte quelle
 * que soit la langue de celui qui l'a copié.
 */
const legalRoute = /^\/(fr|en)\/legals\/([a-z-]+)\/?$/.exec(window.location.pathname);

/**
 * La salle de presse : la liste, et un communiqué.
 *
 * `newsroom` est l'adresse ; `blog` reste comprise, parce qu'elle a pu être
 * partagée avant le changement de nom. Une adresse publiée ne se retire pas.
 */
const blogRoute = /^\/(fr|en)\/(?:newsroom|blog)\/?$/.exec(window.location.pathname);
/*
 * La documentation, sur trois étages.
 *
 * `/fr/docs` est le sommaire, `/fr/docs/<categorie>` la liste d'une catégorie,
 * `/fr/docs/<categorie>/<section>` l'article lui-même. Les deux derniers
 * segments sont facultatifs, et une adresse qui nomme une catégorie inconnue
 * retombe sur le sommaire plutôt que de rendre une page vide : c'est la page
 * qui en décide, pas cette expression, qui se contente de découper.
 */
const docsRoute = /^\/(fr|en)\/docs(?:\/([a-z0-9-]+))?(?:\/([a-z0-9-]+))?\/?$/.exec(
  window.location.pathname,
);
/**
 * Les pages de solution, sur `/fr/solutions/<slug>`.
 *
 * Le segment est facultatif : sans lui, la page rend la liste des six. Un slug
 * inconnu fait de même, plutôt que de laisser tomber le visiteur dans
 * l'application.
 */
const solutionRoute = /^\/(fr|en)\/solutions(?:\/([a-z0-9-]+))?\/?$/.exec(
  window.location.pathname,
);
const postRoute = /^\/(fr|en)\/(?:newsroom|blog)\/([A-Za-z0-9-]+)\/?$/.exec(window.location.pathname);

/**
 * La langue choisie par le visiteur, si tant est qu'il en ait choisi une.
 *
 * Tant qu'il n'a rien dit, l'appareil décide. Dès qu'il bascule lui-même, son
 * choix l'emporte pour toujours : le renvoyer chaque fois vers la langue de son
 * téléphone reviendrait à défaire ce qu'il vient de faire.
 */
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
      // Une adresse inventée renvoie à la politique de confidentialité plutôt
      // qu'à une page blanche : c'est le document qu'on cherche neuf fois sur dix.
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
  try { chosen = localStorage.getItem(LANDING_LANG_KEY); } catch { /* navigation privée */ }

  const wanted = deviceLang();
  if (!chosen && wanted !== landingLang) {
    // Une seule redirection, et vers une vraie adresse : la page anglaise vit à
    // `/en`, pas à `/fr` avec un contenu différent.
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
