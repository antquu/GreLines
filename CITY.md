# City sites

One codebase, several sites. Grenoble is the default. The other cities are the
same app built with `VITE_SITE` set to the city id.

| City | Id | Network code | Domain | Dev port |
| --- | --- | --- | --- | --- |
| Grenoble | *(none)* | M réso | `grelines.fr` | 5173 |
| Nancy | `nancy` | `STAN` | `nancy.grelines.fr` | 5190 |
| Lyon | `lyon` | `TCL` | `lyon.grelines.fr` | 5191 |
| Saint-Étienne | `saint-etienne` | `STAS` | `stetienne.grelines.fr` | 5192 |
| Clermont-Ferrand | `clermont` | `T2C` | `clermontferrand.grelines.fr` | 5193 |

## Running a city locally

```bash
npm run dev:nancy
```

The script runs `vite --mode nancy`. `vite.config.ts` turns a mode that matches
a city id into `VITE_SITE`, so there is no `.env` file per city.

To build one:

```bash
VITE_SITE=nancy npm run build
```

`VITE_SITE` has to be a real environment variable here, because the prebuild
scripts (`scripts/lib/site.mjs`) read it too and only download that city's network.

## Adding a city

Say we add Annecy, with the Sibra network.

### 1. The network

The network has to exist in `src/data/gtfsNetworks.json`. Sibra is already
there. For a network that isn't, add an entry:

```json
{
  "code": "SIBRA",
  "label": "Sibra, Annecy",
  "city": "Annecy",
  "center": [45.8992, 6.1294],
  "gtfs": "https://…/gtfs.zip",
  "tripUpdates": "https://…/trip-updates"
}
```

`tripUpdates` is optional, leave it out if the network has no GTFS-RT feed.
Then generate the data:

```bash
VITE_SITE=annecy npm run networks:gtfs
```

### 2. The site settings

In `src/site.ts`, add the id to `SiteId` and an entry to `CITY_SITES`:

```ts
annecy: {
  id: 'annecy',
  name: 'Annecy',
  host: 'annecy.grelines.fr',
  network: 'SIBRA',
  networkLabel: 'Sibra',
  center: [45.8992, 6.1294],
  areaRadiusMeters: 25_000,
  sncf: true,
  logo: { light: '/assets/sibra-logo.svg', dark: '/assets/sibra-logo-white.svg', width: 96 },
},
```

* `network` is the `code` from `gtfsNetworks.json`
* `center` is `[lat, lon]`, it's where the map opens
* `areaRadiusMeters` is how far from the center we still consider the user in town
* `sncf` shows or hides trains
* the logos go in `public/assets/`

### 3. The build side

Three small lists to update:

* `scripts/lib/site.mjs`: add `annecy: 'SIBRA'` to `SITE_NETWORKS`
* `vite.config.ts`: add `'annecy'` to `CITY_IDS`
* `package.json`: add `"dev:annecy": "vite --mode annecy --port 5194 --strictPort"`

### 4. The static pages

Copy `site/nancy/` to `site/annecy/` and rewrite the four files:

* `index.html`: title, description, canonical URL, Open Graph tags
* `robots.txt`: sitemap URL
* `sitemap.xml`: domain
* `llms.txt`: the city and network description

These replace the Grenoble versions from `public/` and the root `index.html`.

### 5. Deploying

One Vercel project per city, on the same repo:

* environment variable `VITE_SITE=annecy`
* build command `npm run build`, output `dist` (already in `vercel.json`)
* the domain from `host`

## City specific code

Most of the app only looks at `SITE_NETWORK` and `CITY_SITE`. A few things are
still written for Nancy and fall back to "nothing" for other cities:

* shared mobility operators: `src/services/sharedMobility.ts`
* places to visit: `src/services/places.ts`
* data sources listed in the settings: `DATA_SOURCES` in `src/components/SettingsPanel.tsx`

Look for `IS_NANCY` if the new city needs the same.
