import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
// Chargé après index.css : inverse l'échelle de gris quand le thème clair est actif.
import './light-theme.css'
import App from './App.tsx'

console.log(`_
  __ _ _ __ | |_ __ _ _ _
 / _\` | '_ \\| __/ _\` | | | |
| (_| | | | | || (_| | |_| |
 \\__,_|_| |_|\\__\\__, |\\__,_|
                   |_|
                   
       made by antqu • github.com/antquu`
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
