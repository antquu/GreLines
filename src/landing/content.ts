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
 * du fichier attendu dans `/assets/homepage/logos/`.
 */
export interface Partner {
  id: string;
  name: string;
}

export const PARTNERS: Partner[] = [
  { id: 'mreso', name: 'M réso' },
  { id: 'tag', name: 'Tag' },
  { id: 'ter', name: 'TER' },
  { id: 'oura', name: 'OùRA' },
  { id: 'tougo', name: 'Tougo' },
  { id: 'pays-voironnais', name: 'Pays Voironnais' },
  { id: 'tcl', name: 'TCL' },
  { id: 'citiz', name: 'Citiz' },
  { id: 'cars-region', name: 'Cars Région' },
  { id: 'bulles', name: 'Bulles' },
  { id: 'transaltitude', name: 'Transaltitude' },
  { id: 'mcovoit', name: "M'Covoit" },
  { id: 'funiculaire', name: 'Funiculaire des Petites Roches' },
  { id: 'voi', name: 'Voi' },
  { id: 'smmag', name: 'SMMAG' },
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

export interface LandingCopy {
  nav: { features: string; networks: string; screens: string; open: string };
  hero: {
    eyebrow: string;
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
  showcaseTitle: string;
  showcaseBody: string;
  showcase: Showcase[];
  screenTitle: string;
  screenBody: string;
  screenNote: string;
  finalTitle: string;
  finalBody: string;
  finalPrimary: string;
  footerNote: string;
  footerLegal: string;
  switchLang: string;
}

const FR: LandingCopy = {
  nav: {
    features: 'Fonctionnalités',
    networks: 'Réseaux',
    screens: 'Écrans',
    open: "Ouvrir l'app",
  },
  hero: {
    eyebrow: 'Grenoble et sa métropole, en temps réel',
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
  footerNote:
    "GreLines est un projet indépendant. Les données de transport proviennent des exploitants et de leurs services ouverts.",
  footerLegal: 'Tous droits réservés',
  switchLang: 'English',
};

const EN: LandingCopy = {
  nav: {
    features: 'Features',
    networks: 'Networks',
    screens: 'Screens',
    open: 'Open the app',
  },
  hero: {
    eyebrow: 'Grenoble and its metropolitan area, live',
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
  footerNote:
    'GreLines is an independent project. Transit data comes from the operators and their open data services.',
  footerLegal: 'All rights reserved',
  switchLang: 'Français',
};

export const COPY: Record<Lang, LandingCopy> = { fr: FR, en: EN };
