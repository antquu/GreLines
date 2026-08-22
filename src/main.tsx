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
const landingLang = /^\/(fr|en)\/?$/.exec(window.location.pathname)?.[1] as
  | 'fr'
  | 'en'
  | undefined;

if (landingLang) {
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
