import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'

import './light-theme.css'
import { PerfSettingsProvider } from './hooks/usePerfSettings.tsx'

import { Analytics } from '@vercel/analytics/react';

console.log(`_
  __ _ _ __ | |_ __ _ _ _
 / _\` | '_ \\| __/ _\` | | | |
| (_| | | | | || (_| | |_| |
 \\__,_|_| |_|\\__\\__, |\\__,_|
                   |_|
                   
       made by antqu • github.com/antquu`
)

const root = createRoot(document.getElementById('root')!)






if (window.location.pathname.startsWith('/app/screen')) {
  void import('./screen/ScreenApp').then(({ ScreenApp }) => {
    root.render(
      <StrictMode>
        <ScreenApp />
      </StrictMode>,
    )
  })
} else {
  void import('./App.tsx').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <PerfSettingsProvider>
          <App />
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
