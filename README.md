[![Bannière Grelines](https://image.noelshack.com/fichiers/2026/16/2/1776164180-grelines-banniere.png)](https://grelines.vercel.app/)

[![React](https://img.shields.io/badge/React-18.2.4-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0.1-646CFF.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.2.2-38B2AC.svg)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6.svg)](https://www.typescriptlang.org/)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-12.38.0-0055FF.svg)](https://www.framer.com/motion/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900.svg)](https://leafletjs.com/)
[![MapTiler](https://img.shields.io/badge/MapTiler-API-000000.svg)](https://www.maptiler.com/)

> Une application web React moderne pour visualiser les arrêts de transport public de Grenoble avec des informations de départ en temps réel, utilisant Mapbox.

## 📸 Captures d'écran

### Interface principale
![Interface principale](.screenshots/main-interface.png)
*Carte interactive avec les arrêts de transport marqués.*

### Sidebar des détails
![Sidebar ouverte](.screenshots/sidebar-details.png)
*Overlay animé affichant les détails de l'arrêt et les prochains départs.*

### Vue mobile
![Vue mobile](.screenshots/mobile-view-main.png)


## ✨ Fonctionnalités

- 🗺️ **Intégration Mapbox** avec Mapbox GL JS
- 🚌 **Informations d'arrêts en temps réel** via l'API MTAG
- 🎯 **Sidebar animée** glissant depuis la gauche
- 📱 **Carte en plein écran** avec overlay (pas côte à côte)
- 🎨 **Design inspiré du transit** (style MBTA)
- 🚀 **Développement rapide** avec Vite
- 🌙 **Support du mode sombre**
- ⚡ **Design responsive** et optimisé

## 🛠️ Pile technologique

- **Framework Frontend**: React 18 avec TypeScript
- **Outil de build**: Vite
- **Stylisation**: Tailwind CSS
- **Cartes**: Leaflet avec tuiles MapTiler
- **Animations**: Framer Motion
- **Appels API**: Axios
- **Police**: Helvetica/Polices système

## 📁 Structure du projet

```
src/
├── components/          # Composants React
│   ├── Map.tsx         # Composant Mapbox
│   ├── Sidebar.tsx     # Sidebar overlay animée
│   └── index.ts        # Exports des composants
├── services/           # Services API
│   └── api.ts          # Intégration API MTAG + données mock
├── types/              # Types TypeScript
│   └── index.ts        # Définitions des types
├── App.tsx             # Composant principal
├── main.tsx            # Point d'entrée
└── index.css           # Styles globaux avec Tailwind

public/                 # Assets statiques
```

## 🚀 Démarrage rapide

### Prérequis

- Node.js 16+ et npm/yarn

### Installation et développement

1. **Installer les dépendances** (déjà fait dans la configuration initiale)

2. **Démarrer le serveur de développement**:
   ```bash
   npm run dev
   ```

3. **Ouvrir** [http://localhost:5173](http://localhost:5173) dans votre navigateur

### Build pour la production

```bash
npm run build
```

## 🌐 Configuration MapTiler

La carte utilise MapTiler avec une clé gratuite (100k tuiles/mois). La configuration est déjà intégrée dans le code avec votre clé personnelle.

Si vous voulez changer de style MapTiler :
1. Choisissez un style sur [MapTiler](https://www.maptiler.com/)
2. Remplacez le `MAPTILER_STYLE_ID` dans `src/components/Map.tsx`

## 🔌 Intégration API

L'application utilise l'API MTAG (Mobilités Métropolitaines) :
- **URL de base** : `https://data.mobilites-m.fr/donnees`

Actuellement utilisant des **données mock** pour la démonstration. Pour intégrer des données réelles :

1. Mettre à jour les appels API dans `src/services/api.ts`
2. Remplacer les données mock par les vrais endpoints API
3. Adapter les types dans `src/types/index.ts` si nécessaire

## 🏗️ Architecture

### Stratégie de layout
- **Carte** : Plein écran (z-index: 0)
- **Header** : Fixé en haut à gauche avec ombre (z-index: 30)
- **Sidebar** : Overlay animé depuis la gauche, glisse sur la carte (z-index: 40)
- **Backdrop mobile** : Overlay assombri quand sidebar ouverte (z-index: 20)

Cela permet à la carte d'être toujours visible pendant que les détails glissent par-dessus.

### Fonctionnalités en détail

#### Carte Mapbox interactive
- Affiche tous les arrêts de transport de Grenoble
- Marqueurs jaunes pour les arrêts réguliers
- Marqueur bleu pour l'arrêt sélectionné
- Clic sur le marqueur pour voir les détails

#### Sidebar des détails d'arrêt
- Glisse depuis la gauche avec animation fluide
- Affiche le nom et la localisation de l'arrêt
- Liste toutes les lignes desservant l'arrêt
- Affiche les prochains départs avec compteurs
- Indicateurs de statut en temps réel
- Bouton de fermeture tactile

#### Design responsive
- Approche mobile-first
- Sidebar superposée sur tous les écrans
- Interface tactile
- Support du mode sombre

## 💻 Développement

### Scripts disponibles

- `npm run dev` - Démarre le serveur de développement
- `npm run build` - Build pour la production
- `npm run preview` - Aperçu du build de production
- `npm run lint` - Lance ESLint

### Fichiers clés à modifier

**Pour ajouter l'intégration API réelle :**
- `src/services/api.ts` - Remplacer les données mock par des appels API réels

**Pour personnaliser la carte :**
- `src/components/Map.tsx` - Ajuster la configuration Leaflet et les tuiles MapTiler

**Pour personnaliser l'apparence de la sidebar :**
- `src/components/Sidebar.tsx` - Modifier les styles et la disposition

**Pour ajouter de nouvelles informations d'arrêt :**
- `src/types/index.ts` - Étendre les définitions d'interfaces

## 🌍 Support des navigateurs

- Chrome/Edge 88+
- Firefox 85+
- Safari 14+
- Leaflet supporté sur tous les navigateurs modernes

## 📄 Licence

Licence MIT - libre d'utilisation pour vos projets

## 🆘 Support

Pour les problèmes ou questions concernant Leaflet ou MapTiler, consultez :
- [Documentation Leaflet](https://leafletjs.com/)
- [Documentation MapTiler](https://docs.maptiler.com/)
- [Documentation API MTAG](https://data.mobilites-m.fr/donnees)
```

```


```
```
GreLines
├─ .screenshots
│  ├─ main-interface.png
│  ├─ mobile-view-main.png
│  └─ sidebar-details.png
├─ README.md
├─ eslint.config.js
├─ grego
│  ├─ .screenshots
│  │  ├─ img1.png
│  │  ├─ img2.png
│  │  ├─ img3.png
│  │  └─ img4.png
│  ├─ README.md
│  ├─ eslint.config.js
│  ├─ index.html
│  ├─ localStorage-example.json
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ postcss.config.js
│  ├─ public
│  │  ├─ apple-touch-icon.png
│  │  ├─ bygrelines.png
│  │  ├─ favicon-16x16.png
│  │  ├─ favicon-32x32.png
│  │  ├─ favicon.ico
│  │  ├─ favicon.png
│  │  ├─ favicon.svg
│  │  ├─ grelines.png
│  │  ├─ icons.svg
│  │  ├─ journey.svg
│  │  ├─ logos
│  │  │  ├─ apple-touch-icon-dark.png
│  │  │  ├─ dark_no_bg_banner.png
│  │  │  └─ light_no_bg_banner.png
│  │  ├─ manifest.json
│  │  ├─ nomobile.png
│  │  ├─ robots.txt
│  │  ├─ sitemap.xml
│  │  └─ walk.svg
│  ├─ src
│  │  ├─ App.css
│  │  ├─ App.jsx
│  │  ├─ assets
│  │  │  ├─ hero.png
│  │  │  ├─ react.svg
│  │  │  └─ vite.svg
│  │  ├─ components
│  │  │  ├─ DisruptionItem.jsx
│  │  │  ├─ JourneyCard.jsx
│  │  │  ├─ JourneyDetailsSheet.jsx
│  │  │  ├─ JourneyMapModal.jsx
│  │  │  ├─ JourneyResultsHeader.jsx
│  │  │  ├─ JourneyTimeline.jsx
│  │  │  ├─ LineInfoSheet.jsx
│  │  │  ├─ MapSheet.jsx
│  │  │  ├─ SearchSheet.jsx
│  │  │  ├─ StopPickerMap.jsx
│  │  │  ├─ TrajetTabBar.jsx
│  │  │  ├─ WalkRouteSheet.jsx
│  │  │  ├─ lines-icons.jsx
│  │  │  └─ nearestStops.jsx
│  │  ├─ fast-research.jsx
│  │  ├─ hooks
│  │  │  ├─ useCurrentTime.js
│  │  │  ├─ useDisruptions.js
│  │  │  ├─ useLineColors.js
│  │  │  ├─ useSettings.js
│  │  │  └─ useStops.js
│  │  ├─ index.css
│  │  ├─ lines-icons.jsx
│  │  ├─ main.jsx
│  │  ├─ mes-trajets.jsx
│  │  ├─ navbar.jsx
│  │  ├─ nomobile.jsx
│  │  ├─ old
│  │  │  ├─ fast-research.jsx
│  │  │  ├─ lines-icons.jsx
│  │  │  ├─ mes-trajets-test.jsx
│  │  │  ├─ mestrajets-test.jsx
│  │  │  ├─ mestrajets.jsx
│  │  │  ├─ navbar.jsx
│  │  │  ├─ nomobile.jsx
│  │  │  └─ settings.jsx
│  │  ├─ settings.jsx
│  │  └─ utils
│  │     └─ journey.js
│  ├─ tailwind.config.js
│  ├─ vercel.json
│  └─ vite.config.js
├─ index.html
├─ package-lock.json
├─ package.json
├─ postcss.config.js
├─ public
│  ├─ .stops.json
│  ├─ assets
│  │  ├─ GitHubLOGO.png
│  │  ├─ GreGoLOGO.png
│  │  ├─ GreLinesAssoLOGO.png
│  │  ├─ GreLinesLOGO.png
│  │  ├─ Gresivaudan-selectioned.png
│  │  ├─ Gresivaudan.png
│  │  ├─ M-Reso.png
│  │  ├─ Metropole-selectioned.png
│  │  ├─ Metropole.png
│  │  ├─ Region-selectioned.png
│  │  ├─ Region.png
│  │  ├─ Voironnais-selected.png
│  │  ├─ Voironnais.png
│  │  ├─ auto-selectioned.svg
│  │  ├─ auto.svg
│  │  ├─ dark-selectioned.svg
│  │  ├─ dark.svg
│  │  ├─ icons.txt
│  │  ├─ light-selectioned.svg
│  │  └─ light.svg
│  ├─ flavicon.png
│  ├─ fonts
│  │  ├─ Canaro W00 Medium.ttf
│  │  ├─ Helvetica Neue Bold.ttf
│  │  ├─ Helvetica Neue Medium.ttf
│  │  ├─ Inter-Black.woff
│  │  ├─ Inter-Black.woff2
│  │  ├─ Inter-Bold.woff
│  │  ├─ Inter-Bold.woff2
│  │  ├─ Inter-ExtraBold.woff
│  │  ├─ Inter-ExtraBold.woff2
│  │  ├─ Inter-ExtraLight.woff
│  │  ├─ Inter-ExtraLight.woff2
│  │  ├─ Inter-Light.woff
│  │  ├─ Inter-Light.woff2
│  │  ├─ Inter-Medium.woff
│  │  ├─ Inter-Medium.woff2
│  │  ├─ Inter-Regular.woff
│  │  ├─ Inter-Regular.woff2
│  │  ├─ Inter-SemiBold.woff
│  │  ├─ Inter-SemiBold.woff2
│  │  ├─ Inter-Thin.woff
│  │  └─ Inter-Thin.woff2
│  ├─ grelines.json
│  └─ icons.svg
├─ src
│  ├─ App.css
│  ├─ App.tsx
│  ├─ assets
│  │  ├─ hero.png
│  │  ├─ react.svg
│  │  └─ vite.svg
│  ├─ components
│  │  ├─ AddFavoriteModal.tsx
│  │  ├─ AddressSidebar.tsx
│  │  ├─ FavoriteCard.tsx
│  │  ├─ HomeSheet.tsx
│  │  ├─ ItinerarySteps.tsx
│  │  ├─ JourneyDetailsPreview.tsx
│  │  ├─ JourneyTimeline.tsx
│  │  ├─ LineBadge.tsx
│  │  ├─ Map.tsx
│  │  ├─ RouteSidebar.tsx
│  │  ├─ SearchBarMobile.tsx
│  │  ├─ SettingsPanel.tsx
│  │  ├─ Sidebar.tsx
│  │  ├─ SidebarMobile.tsx
│  │  ├─ TrafficPanelMobile.tsx
│  │  └─ index.ts
│  ├─ hooks
│  │  ├─ useDebouncedValue.ts
│  │  ├─ useFavoriteDetails.ts
│  │  ├─ useFavorites.ts
│  │  └─ useStopUrlSync.ts
│  ├─ index.css
│  ├─ main.tsx
│  ├─ services
│  │  ├─ allLines.ts
│  │  ├─ api.ts
│  │  ├─ config.ts
│  │  ├─ favorites.ts
│  │  ├─ geocoding.ts
│  │  ├─ index.ts
│  │  └─ lineShapes.ts
│  ├─ types
│  │  └─ index.ts
│  └─ utils
│     ├─ geo.ts
│     ├─ lineColors.ts
│     ├─ stopTrafficMatcher.ts
│     └─ stripHtml.ts
├─ tailwind.config.js
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
├─ vercel.json
└─ vite.config.ts

```
