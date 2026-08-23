/**
 * Ce que la vitrine raconte, en français et en anglais.
 *
 * Séparé de la mise en page : les textes d'une page de présentation se
 * retouchent souvent, et l'on ne devrait pas avoir à traverser du JSX pour
 * corriger une phrase.
 *
 * Rien n'y est inventé. Chaque chiffre et chaque promesse correspond à quelque
 * chose que l'application fait réellement — une vitrine qui promet plus que le
 * produit se retourne contre lui au premier lancement.
 */

export type Lang = 'fr' | 'en';

/**
 * Les réseaux et opérateurs desservis.
 *
 * L'ordre est celui du bandeau : les plus reconnaissables d'abord, pour qu'un
 * regard qui ne s'attarde pas tombe sur un nom qu'il connaît. `id` est le nom
 * du fichier, tel quel, dans `/assets/homepage/svg/` — casse comprise.
 *
 * Transaltitude n'y figure pas : son logotype ne tient pas la comparaison avec
 * les autres, et un bandeau vaut par son maillon le plus faible.
 */
export interface Partner {
  id: string;
  name: string;
  /**
   * La zone utile du fichier, en fractions de la toile.
   *
   * Les onze logotypes sont dessinés sur la même toile de 1414 × 849, mais
   * n'en occupent chacun qu'une bande, et jamais la même : de 34 % de la
   * hauteur pour le plus large à 70 % pour le plus carré. Affichés à hauteur
   * de fichier égale, ils paraîtraient donc deux fois plus gros les uns que
   * les autres.
   *
   * On mesure donc la boîte englobante de chaque tracé — relevée sur le canal
   * alpha, une fois pour toutes — et l'on cale la rangée sur la hauteur de
   * l'encre, pas sur celle du fichier.
   */
  box: { x0: number; x1: number; y0: number; y1: number };
}

export const PARTNERS: Partner[] = [
  { id: '1', name: 'M réso', box: { x0: 0.163, x1: 0.834, y0: 0.247, y1: 0.747 } },
  { id: 'TER', name: 'TER', box: { x0: 0.173, x1: 0.823, y0: 0.235, y1: 0.759 } },
  { id: '2', name: 'Tag', box: { x0: 0.071, x1: 0.912, y0: 0.276, y1: 0.718 } },
  { id: 'citiz', name: 'Citiz', box: { x0: 0.113, x1: 0.883, y0: 0.3, y1: 0.694 } },
  { id: '3', name: 'OùRA', box: { x0: 0.102, x1: 0.894, y0: 0.229, y1: 0.765 } },
  { id: 'TCL', name: 'TCL', box: { x0: 0.191, x1: 0.795, y0: 0.3, y1: 0.706 } },
  { id: 'MCovoit', name: "M'Covoit", box: { x0: 0.081, x1: 0.915, y0: 0.276, y1: 0.718 } },
  { id: '4', name: 'Tougo', box: { x0: 0.049, x1: 0.926, y0: 0.329, y1: 0.665 } },
  { id: 'Bulle', name: 'Bulles', box: { x0: 0.286, x1: 0.71, y0: 0.147, y1: 0.847 } },
  { id: 'voi', name: 'Voi', box: { x0: 0.141, x1: 0.855, y0: 0.253, y1: 0.741 } },
];

interface Feature {
  /** Nom du fichier d'icône, dans `/assets/homepage/icons/`. */
  icon: string;
  title: string;
  body: string;
}

interface Showcase {
  /** Nom du fichier de capture, dans `/assets/homepage/`. */
  image: string;
  title: string;
  body: string;
}

/**
 * Un pilier : une grande affirmation, une photo, une preuve, des capacités.
 *
 * C'est le motif que Vercel emploie pour ses trois publics — une phrase qui
 * tient debout seule, un visuel qui occupe la moitié de la largeur, une preuve
 * chiffrée, puis la liste de ce qu'on sait faire. Là où ils montrent des
 * captures de logiciel, on montre le réseau : un tram, un abribus, un quai.
 */
export interface Pillar {
  /** Nom du fichier photo, dans `/assets/homepage/photos/`. */
  photo: string;
  /** Ce que la photo montre, pour ceux qui ne la voient pas. */
  alt: string;
  title: string;
  /** La preuve. `strong` est la part écrite en pleine encre. */
  proof: { strong: string; rest: string };
  items: { name: string; note: string }[];
}

/**
 * L'adresse de la page d'état du service.
 *
 * Sortie ici parce qu'elle n'existe pas encore : le jour où elle est hébergée
 * ailleurs, c'est la seule ligne à changer.
 */
export const STATUS_URL = 'https://status.grelines.fr';

/**
 * Une entrée du menu « Solutions ».
 *
 * Ce menu s'adresse aux réseaux, pas aux voyageurs : c'est là qu'un exploitant
 * qui tombe sur la page doit comprendre en trois lignes ce qu'on peut faire
 * pour lui. Chaque entrée correspond à quelque chose qui tourne déjà — rien
 * n'y est annoncé qui reste à écrire.
 */
export interface Solution {
  name: string;
  note: string;
  href: string;
}

/**
 * Les intitulés de section, en petites capitales mono.
 *
 * Ils ne décrivent pas, ils situent : deux mots au-dessus d'un titre, pour dire
 * dans quelle partie du discours on se trouve.
 */
export interface LandingCopy {
  eyebrows: {
    solutions: string;
    networks: string;
    features: string;
    showcase: string;
    screens: string;
    start: string;
  };
  nav: { features: string; networks: string; screens: string; open: string; solutions: string };
  solutions: Solution[];
  footer: {
    columns: { title: string; links: { label: string; href: string }[] }[];
    status: string;
    theme: string;
    themeAuto: string;
    themeLight: string;
    themeDark: string;
  };
  hero: {
    eyebrow: string;
    /** Ce que montre le montage du hero, pour ceux qui ne le voient pas. */
    headerAlt: string;
    title: string;
    titleAccent: string;
    body: string;
    primary: string;
    secondary: string;
  };
  marquee: string;
  stats: { value: string; label: string }[];
  featuresTitle: string;
  featuresBody: string;
  features: Feature[];
  /** Les trois piliers, dans l'ordre d'apparition. */
  pillars: Pillar[];
  /** Les lignes qui se relaient sous le grand titre du hero. */
  heroLines: { lead: string; rest: string }[];
  showcaseTitle: string;
  showcaseBody: string;
  showcase: Showcase[];
  screenTitle: string;
  screenBody: string;
  screenNote: string;
  finalTitle: string;
  finalBody: string;
  finalPrimary: string;
  footerLegal: string;
  switchLang: string;
}

const FR: LandingCopy = {
  eyebrows: {
    solutions: 'Pour les réseaux',
    networks: 'Le réseau',
    features: "Ce qu'elle fait",
    showcase: 'En main',
    screens: 'Sur grand écran',
    start: 'Pour commencer',
  },
  nav: {
    features: 'Fonctionnalités',
    networks: 'Réseaux',
    screens: 'Écrans',
    open: "Ouvrir l'app",
    solutions: 'Solutions',
  },
  solutions: [
    {
      name: 'GreLines Screen',
      note: 'Les prochains passages d’un arrêt en plein écran, sur n’importe quel téléviseur. Sans installation, sans compte, avec une adresse fixe.',
      href: '/app/screen',
    },
    {
      name: 'Affiches et QR codes',
      note: 'Une adresse durable par arrêt, qui survit aux renommages du réseau, et le décompte des scans pour chaque affiche posée.',
      href: '#screens',
    },
    {
      name: 'Messages aux porteurs',
      note: 'Une perturbation, un abonnement qui expire, un mot du réseau : adressés à une carte OùRA, reçus dans l’application.',
      href: '#features',
    },
    {
      name: 'Retours voyageurs',
      note: 'Affluence signalée à bord, avis sur les lignes et sur les arrêts, remontés en continu et sans compte à créer.',
      href: '#features',
    },
    {
      name: 'GreLines Data',
      note: 'Le guichet où vos voyageurs consultent ce qui est conservé sur eux, et en demandent la suppression.',
      href: 'https://data.grelines.fr',
    },
    {
      name: 'Intégrer votre réseau',
      note: 'Vos lignes, vos arrêts et votre temps réel ajoutés à l’application, à côté des onze réseaux déjà desservis.',
      href: '#networks',
    },
  ],
  footer: {
    columns: [
      {
        title: 'Application',
        links: [
          { label: 'Ouvrir GreLines', href: '/app' },
          { label: 'Itinéraires', href: '/app/mob/route' },
          { label: 'Favoris', href: '/app/mob/favorites' },
          { label: 'Réglages', href: '/app/mob/settings' },
        ],
      },
      {
        title: 'Écrans',
        links: [
          { label: 'GreLines Screen', href: '/app/screen' },
          { label: 'Affiches et QR codes', href: '#screens' },
          { label: 'Intégrer votre réseau', href: '#networks' },
        ],
      },
      {
        title: 'Réseaux',
        links: [
          { label: 'Réseaux desservis', href: '#networks' },
          { label: 'Ce que fait l’application', href: '#features' },
          { label: 'Messages aux porteurs', href: '#features' },
          { label: 'Retours voyageurs', href: '#features' },
        ],
      },
      {
        title: 'Données',
        links: [
          { label: 'GreLines Data', href: 'https://data.grelines.fr' },
          { label: 'Consulter mes données', href: 'https://data.grelines.fr/mes-donnees' },
          { label: 'Demander la suppression', href: 'https://data.grelines.fr/suppression' },
        ],
      },
      {
        title: 'Ressources',
        links: [
          { label: 'État du service', href: STATUS_URL },
          { label: 'Code source', href: 'https://github.com/antquu' },
        ],
      },
      {
        title: 'Langue',
        links: [
          { label: 'Français', href: '/fr' },
          { label: 'English', href: '/en' },
        ],
      },
      {
        title: 'Légal et confiance',
        links: [
          { label: 'Politique de confidentialité', href: '/fr/legals/privacy-policy' },
          { label: 'RGPD', href: '/fr/legals/gdpr' },
          { label: "Conditions d'utilisation", href: '/fr/legals/terms-of-service' },
          { label: 'Conditions de vente', href: '/fr/legals/terms-of-sale' },
          { label: 'Vos données', href: 'https://data.grelines.fr' },
        ],
      },
      {
        title: 'Social',
        links: [{ label: 'GitHub', href: 'https://github.com/antquu' }],
      },
    ],
    status: 'Tous les services fonctionnent',
    theme: 'Thème',
    themeAuto: 'Suivre le système',
    themeLight: 'Thème clair',
    themeDark: 'Thème sombre',
  },

  hero: {
    eyebrow: 'Grenoble et sa métropole, en temps réel',
    headerAlt:
      'Un tram Tag, un bus Chrono, les bulles de la Bastille et les montagnes au-dessus de Grenoble',
    title: 'Tous vos transports',
    titleAccent: 'sur un seul écran.',
    body: "Prochains passages à la seconde, itinéraires porte à porte, plan interactif, carte OùRA dans votre poche. Onze réseaux réunis dans une application gratuite, sans compte et sans publicité.",
    primary: "Ouvrir GreLines",
    secondary: 'Voir les fonctionnalités',
  },
  marquee: 'Onze réseaux, un seul endroit',
  stats: [
    { value: '11', label: 'réseaux réunis' },
    { value: '3 000+', label: 'arrêts desservis' },
    { value: '15 s', label: 'de fraîcheur des passages' },
    { value: '0 €', label: 'sans compte, sans publicité' },
  ],
  heroLines: [
    { lead: 'Pour attendre moins', rest: 'en sachant à la seconde quand le tram arrive.' },
    { lead: 'Pour aller partout', rest: 'sur onze réseaux, sans changer d’application.' },
    { lead: 'Pour voyager léger', rest: 'avec la carte OùRA dans le téléphone.' },
  ],
  pillars: [
    {
      photo: 'reseau.jpg',
      alt: 'Un tram de la ligne A traversant le centre de Grenoble',
      title: 'Onze réseaux, une seule application',
      proof: {
        strong: 'Plus de 3 000 arrêts',
        rest: 'de la métropole au Grésivaudan, jusqu’à Lyon.',
      },
      items: [
        { name: 'Tram et bus', note: 'M réso, Tag, Tougo, Pays Voironnais, Bulles.' },
        { name: 'Train', note: 'Les TER qui desservent la cuvette, aux mêmes horaires.' },
        { name: 'Montagne', note: 'Transaltitude et le funiculaire des Petites Roches.' },
        { name: 'Partagé', note: 'Citiz, trottinettes et covoiturage M’Covoit.' },
      ],
    },
    {
      photo: 'arret.jpg',
      alt: 'Un abribus la nuit, sous la pluie',
      title: 'Le temps réel, pas les horaires théoriques',
      proof: {
        strong: 'Rafraîchi toutes les 15 secondes',
        rest: 'directement depuis les données de l’exploitant.',
      },
      items: [
        { name: 'Passages réels', note: 'Un bus supprimé disparaît, un tram en retard le dit.' },
        { name: 'Infotrafic', note: 'Perturbations et déviations rattachées à vos lignes.' },
        { name: 'Affluence', note: 'Ce que les voyageurs signalent, quand ils le signalent.' },
        { name: 'Qualité de l’air', note: 'La mesure du jour, sur la commune que vous regardez.' },
      ],
    },
    {
      photo: 'quai.jpg',
      alt: 'Un voyageur consultant son téléphone sur un quai de tram',
      title: 'Ouverte à l’arrêt, pas au bureau',
      proof: {
        strong: 'Trois secondes',
        rest: 'entre l’écran de veille et le prochain passage.',
      },
      items: [
        { name: 'Itinéraires', note: 'Porte à porte, avec le guidage pas à pas.' },
        { name: 'Carte OùRA', note: 'Photographiée une fois, consultable hors ligne.' },
        { name: 'Favoris', note: 'Vos arrêts et vos trajets, en haut de l’écran.' },
        { name: 'Installable', note: 'Sur l’écran d’accueil, en plein écran, sans magasin.' },
      ],
    },
  ],
  featuresTitle: 'Ce que GreLines fait pour vous',
  featuresBody:
    "Pas une liste d'horaires théoriques : ce que le réseau annonce vraiment, à l'instant où vous regardez.",
  features: [
    {
      icon: 'realtime',
      title: 'Temps réel à la seconde',
      body: "Les prochains passages viennent directement du réseau et se rafraîchissent tout seuls. Un bus supprimé disparaît, un tram en retard le dit.",
    },
    {
      icon: 'route',
      title: 'Itinéraires porte à porte',
      body: 'Marche, tram, bus, TER, covoiturage : un seul calcul, plusieurs options, et le trajet se suit pas à pas en guidage.',
    },
    {
      icon: 'map',
      title: 'Plan interactif',
      body: "Tous les arrêts sur la carte, le tracé des lignes, les véhicules en libre-service et la qualité de l'air, à la volée.",
    },
    {
      icon: 'card',
      title: 'Carte OùRA dans le téléphone',
      body: "Photographiez votre carte : abonnement, validité et titre restent consultables hors ligne, et le contrôle se fait d'un geste.",
    },
    {
      icon: 'traffic',
      title: 'Infotrafic sans filtre',
      body: "Perturbations, travaux et déviations tels que l'exploitant les publie, rattachés aux lignes que vous suivez.",
    },
    {
      icon: 'offline',
      title: 'Installable, et rapide',
      body: "Ajoutée à l'écran d'accueil, elle s'ouvre en plein écran, garde ses données en cache et démarre en un instant.",
    },
  ],
  showcaseTitle: 'Fait pour être ouvert à l’arrêt',
  showcaseBody:
    "Une main, trois secondes, la bonne information. C'est la seule mesure qui compte quand le bus arrive.",
  showcase: [
    {
      image: 'app-carte.png',
      title: 'La carte, d’abord',
      body: 'Les arrêts autour de vous, à jour, sans rien chercher.',
    },
    {
      image: 'app-arret.png',
      title: 'Un arrêt, tout de suite',
      body: 'Les prochains passages ligne par ligne, avec la direction.',
    },
    {
      image: 'app-itineraire.png',
      title: 'Le trajet, guidé',
      body: 'Chaque correspondance annoncée, chaque descente rappelée.',
    },
  ],
  screenTitle: 'Et le même service, en grand',
  screenBody:
    "Un téléviseur, un vieil ordinateur, une tablette au mur : GreLines Screen affiche les prochains passages d'un arrêt en plein écran, sans installation et sans compte. Un hall d'accueil, une salle des profs, un comptoir — l'adresse suffit.",
  screenNote: "Adresse fixe, lisible de loin, s'actualise toute seule.",
  finalTitle: 'Ouvrez-la, elle est déjà prête',
  finalBody:
    "Rien à créer, rien à télécharger, rien à payer. La carte s'affiche, les passages arrivent.",
  finalPrimary: 'Ouvrir GreLines',
  footerLegal: 'Tous droits réservés',
  switchLang: 'English',
};

const EN: LandingCopy = {
  eyebrows: {
    solutions: 'For networks',
    networks: 'The network',
    features: 'What it does',
    showcase: 'In hand',
    screens: 'On the big screen',
    start: 'Getting started',
  },
  nav: {
    features: 'Features',
    networks: 'Networks',
    screens: 'Screens',
    open: 'Open the app',
    solutions: 'Solutions',
  },
  solutions: [
    {
      name: 'GreLines Screen',
      note: 'A stop’s next departures full screen, on any television. Nothing to install, no account, and a fixed address.',
      href: '/app/screen',
    },
    {
      name: 'Posters and QR codes',
      note: 'A durable address per stop that survives the network renaming its own codes, and a scan count for every poster you put up.',
      href: '#screens',
    },
    {
      name: 'Messages to cardholders',
      note: 'A disruption, an expiring pass, a word from the network: addressed to an OùRA card, received in the app.',
      href: '#features',
    },
    {
      name: 'Rider feedback',
      note: 'Crowding reported on board, reviews of lines and stops, coming in continuously with no account to create.',
      href: '#features',
    },
    {
      name: 'GreLines Data',
      note: 'The desk where your riders see what is kept about them, and ask for it to be deleted.',
      href: 'https://data.grelines.fr',
    },
    {
      name: 'Add your network',
      note: 'Your lines, your stops and your live data added to the app, alongside the eleven networks already served.',
      href: '#networks',
    },
  ],
  footer: {
    columns: [
      {
        title: 'App',
        links: [
          { label: 'Open GreLines', href: '/app' },
          { label: 'Journeys', href: '/app/mob/route' },
          { label: 'Favourites', href: '/app/mob/favorites' },
          { label: 'Settings', href: '/app/mob/settings' },
        ],
      },
      {
        title: 'Screens',
        links: [
          { label: 'GreLines Screen', href: '/app/screen' },
          { label: 'Posters and QR codes', href: '#screens' },
          { label: 'Add your network', href: '#networks' },
        ],
      },
      {
        title: 'Networks',
        links: [
          { label: 'Networks served', href: '#networks' },
          { label: 'What the app does', href: '#features' },
          { label: 'Messages to cardholders', href: '#features' },
          { label: 'Rider feedback', href: '#features' },
        ],
      },
      {
        title: 'Data',
        links: [
          { label: 'GreLines Data', href: 'https://data.grelines.fr' },
          { label: 'See my data', href: 'https://data.grelines.fr/mes-donnees' },
          { label: 'Request deletion', href: 'https://data.grelines.fr/suppression' },
        ],
      },
      {
        title: 'Resources',
        links: [
          { label: 'Service status', href: STATUS_URL },
          { label: 'Source code', href: 'https://github.com/antquu' },
        ],
      },
      {
        title: 'Language',
        links: [
          { label: 'Français', href: '/fr' },
          { label: 'English', href: '/en' },
        ],
      },
      {
        title: 'Legal & Trust',
        links: [
          { label: 'Privacy policy', href: '/en/legals/privacy-policy' },
          { label: 'GDPR', href: '/en/legals/gdpr' },
          { label: 'Terms of service', href: '/en/legals/terms-of-service' },
          { label: 'Terms of sale', href: '/en/legals/terms-of-sale' },
          { label: 'Your data', href: 'https://data.grelines.fr' },
        ],
      },
      {
        title: 'Social',
        links: [{ label: 'GitHub', href: 'https://github.com/antquu' }],
      },
    ],
    status: 'All systems normal',
    theme: 'Theme',
    themeAuto: 'Follow the system',
    themeLight: 'Light theme',
    themeDark: 'Dark theme',
  },

  hero: {
    eyebrow: 'Grenoble and its metropolitan area, live',
    headerAlt:
      'A Tag tram, a Chrono bus, the Bastille cable cars and the mountains above Grenoble',
    title: 'Every transit network',
    titleAccent: 'on a single screen.',
    body: 'Live departures to the second, door-to-door journeys, an interactive map, your OùRA card in your pocket. Eleven networks in one free app — no account, no ads.',
    primary: 'Open GreLines',
    secondary: 'See the features',
  },
  marquee: 'Eleven networks, one place',
  stats: [
    { value: '11', label: 'networks covered' },
    { value: '3,000+', label: 'stops served' },
    { value: '15 s', label: 'departure refresh rate' },
    { value: '€0', label: 'no account, no ads' },
  ],
  heroLines: [
    { lead: 'To wait less', rest: 'by knowing to the second when the tram arrives.' },
    { lead: 'To go anywhere', rest: 'across eleven networks, without switching apps.' },
    { lead: 'To travel light', rest: 'with your OùRA card inside your phone.' },
  ],
  pillars: [
    {
      photo: 'reseau.jpg',
      alt: 'A line A tram crossing central Grenoble',
      title: 'Eleven networks, one single app',
      proof: {
        strong: 'Over 3,000 stops',
        rest: 'from the metropolitan area to the Grésivaudan, all the way to Lyon.',
      },
      items: [
        { name: 'Tram and bus', note: 'M réso, Tag, Tougo, Pays Voironnais, Bulles.' },
        { name: 'Train', note: 'The regional trains serving the valley, same timetable.' },
        { name: 'Mountain', note: 'Transaltitude and the Petites Roches funicular.' },
        { name: 'Shared', note: 'Citiz, scooters and M’Covoit carpooling.' },
      ],
    },
    {
      photo: 'arret.jpg',
      alt: 'A bus shelter at night, in the rain',
      title: 'Live departures, not printed timetables',
      proof: {
        strong: 'Refreshed every 15 seconds',
        rest: 'straight from the operator’s own data.',
      },
      items: [
        { name: 'Real departures', note: 'A cancelled bus disappears; a late tram says so.' },
        { name: 'Service updates', note: 'Disruptions and diversions tied to your lines.' },
        { name: 'Crowding', note: 'What riders report, when they report it.' },
        { name: 'Air quality', note: 'Today’s reading, for the town you are looking at.' },
      ],
    },
    {
      photo: 'quai.jpg',
      alt: 'A traveller checking their phone on a tram platform',
      title: 'Opened at the stop, not at a desk',
      proof: {
        strong: 'Three seconds',
        rest: 'from lock screen to the next departure.',
      },
      items: [
        { name: 'Journeys', note: 'Door to door, with turn-by-turn guidance.' },
        { name: 'OùRA card', note: 'Photographed once, readable offline.' },
        { name: 'Favourites', note: 'Your stops and journeys, at the top of the screen.' },
        { name: 'Installable', note: 'On your home screen, full screen, no app store.' },
      ],
    },
  ],
  featuresTitle: 'What GreLines does for you',
  featuresBody:
    'Not a timetable in theory: what the network is actually announcing, the moment you look.',
  features: [
    {
      icon: 'realtime',
      title: 'Live to the second',
      body: 'Departures come straight from the operators and refresh on their own. A cancelled bus disappears; a late tram says so.',
    },
    {
      icon: 'route',
      title: 'Door-to-door journeys',
      body: 'Walking, tram, bus, regional trains, carpooling: one search, several options, and turn-by-turn guidance along the way.',
    },
    {
      icon: 'map',
      title: 'Interactive map',
      body: 'Every stop on the map, line traces, shared vehicles and air quality, all in one view.',
    },
    {
      icon: 'card',
      title: 'Your OùRA card, in the app',
      body: 'Photograph your card: pass, validity and holder stay readable offline, and inspection takes one gesture.',
    },
    {
      icon: 'traffic',
      title: 'Unfiltered service updates',
      body: 'Disruptions, works and diversions exactly as the operator publishes them, attached to the lines you follow.',
    },
    {
      icon: 'offline',
      title: 'Installable, and fast',
      body: 'Added to your home screen it opens full screen, caches its data and starts instantly.',
    },
  ],
  showcaseTitle: 'Built to be opened at the stop',
  showcaseBody:
    'One hand, three seconds, the right answer. That is the only measure that matters when the bus is coming.',
  showcase: [
    {
      image: 'app-carte.png',
      title: 'The map, first',
      body: 'Stops around you, up to date, with nothing to search for.',
    },
    {
      image: 'app-arret.png',
      title: 'A stop, right away',
      body: 'Next departures line by line, with the direction.',
    },
    {
      image: 'app-itineraire.png',
      title: 'The journey, guided',
      body: 'Every connection announced, every alighting reminded.',
    },
  ],
  screenTitle: 'And the same service, in large',
  screenBody:
    'A television, an old computer, a tablet on the wall: GreLines Screen shows a stop’s next departures full screen, with nothing to install and no account. A lobby, a staff room, a counter — the address is all it takes.',
  screenNote: 'Fixed address, readable from afar, refreshes itself.',
  finalTitle: 'Open it — it is already running',
  finalBody: 'Nothing to create, nothing to download, nothing to pay. The map loads, the departures arrive.',
  finalPrimary: 'Open GreLines',
  footerLegal: 'All rights reserved',
  switchLang: 'Français',
};

export const COPY: Record<Lang, LandingCopy> = { fr: FR, en: EN };
