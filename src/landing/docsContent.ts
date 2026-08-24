/**
 * Ce que raconte la documentation, en français et en anglais.
 *
 * Séparé de la mise en page, pour la même raison que `content.ts` : un texte de
 * documentation se corrige souvent, et l'on ne devrait pas avoir à traverser du
 * JSX pour préciser une phrase.
 *
 * Deux règles tenues d'un bout à l'autre.
 *
 * La première : rien n'y est promis qui n'existe pas. Chaque commande, chaque
 * variable, chaque nom de table correspond à quelque chose qui est dans le
 * dépôt. Une documentation qui décrit un produit rêvé se retourne contre lui au
 * premier essai, et plus durement qu'une page de présentation, parce qu'on la
 * lit en travaillant.
 *
 * La seconde : l'architecture se raconte, les secrets non. Les pages qui
 * suivent disent quelles briques existent, ce qu'elles font et comment on les
 * remonte chez soi. Elles ne contiennent aucune clé, aucune adresse de projet,
 * aucun identifiant. Un lecteur peut reconstruire GreLines à partir d'ici ; il
 * ne peut pas entrer dans celui qui tourne.
 */

import type { Lang } from './content';
import type { IconName } from './docsIcons';

/** Les langages que le bloc de code sait colorer. */
export type CodeLang = 'ts' | 'bash' | 'env' | 'sql' | 'json' | 'txt';

/** Un morceau de section. Un type inconnu n'est pas rendu plutôt que de casser. */
export type DocBlock =
  | { kind: 'p'; text: string }
  /** Une marche à suivre, numérotée. */
  | { kind: 'steps'; items: string[] }
  /** Une liste de notions : un nom, une glose. */
  | { kind: 'list'; items: { name: string; note: string }[] }
  /** Du code. Avec un nom de fichier, il reçoit une barre de titre. */
  | { kind: 'code'; text: string; lang?: CodeLang; file?: string }
  /** L'encadré : ce qu'il faut savoir avant d'aller plus loin. */
  | { kind: 'note'; text: string };

/**
 * Une entrée de documentation.
 *
 * `id` sert trois fois : l'ancre dans l'adresse, le lien du sommaire, et le
 * lien de la carte en haut de page. Les trois désignent donc toujours la même
 * chose, ce qui évite qu'un sommaire finisse par mentir sur son contenu.
 */
export interface DocEntry {
  id: string;
  icon: IconName;
  title: string;
  /** La phrase qui accompagne le titre dans le sommaire et sur la carte. */
  note: string;
  body: DocBlock[];
}

export interface DocGroup {
  id: string;
  title: string;
  /** Ce que contient la catégorie, en une phrase, sur sa carte et sur sa page. */
  note: string;
  entries: DocEntry[];
}

export interface DocsCopy {
  eyebrow: string;
  title: string;
  lead: string;
  primary: string;
  secondary: string;
  searchLabel: string;
  searchEmpty: string;
  tocTitle: string;
  tocToggle: string;
  /** Le mot qui compte les sections sur la carte d'une catégorie. */
  sections: string;
  /** Ce qu'annonce le bas d'une carte de catégorie. */
  browse: string;
  /** Le retour au sommaire, au pied d'une page de catégorie. */
  allCategories: string;
  /** Les deux sections voisines, au pied d'un article. */
  previous: string;
  next: string;
  copy: string;
  copied: string;
  helpTitle: string;
  helpBody: string;
  helpCta: string;
  groups: DocGroup[];
}

/** L'adresse à qui écrire. Une seule ligne à changer le jour où elle change. */
export const DOCS_EMAIL = 'ant.adam468@gmail.com';

/* -------------------------------------------------------------------------
 * Français.
 * ---------------------------------------------------------------------- */

const FR: DocsCopy = {
  eyebrow: 'Documentation',
  title: 'Se servir de GreLines, et le remonter chez soi',
  lead: "Comment l'application fonctionne, de quoi elle est faite, comment la faire tourner sur sa propre machine, comment un réseau y raccorde ses données. Chaque page décrit ce que le produit fait aujourd'hui, pas ce qu'il fera.",
  primary: 'Ouvrir GreLines',
  secondary: 'Nous écrire',
  searchLabel: 'Filtrer le sommaire',
  searchEmpty: 'Rien ne correspond.',
  tocTitle: 'Sommaire',
  tocToggle: 'Sommaire',
  sections: 'sections',
  browse: 'Parcourir',
  allCategories: 'Toutes les catégories',
  previous: 'Précédent',
  next: 'Suivant',
  copy: 'Copier',
  copied: 'Copié',
  helpTitle: 'Il manque quelque chose ?',
  helpBody:
    "Cette documentation grandit avec le produit. Si vous cherchez une réponse qui n'y est pas, écrivez : on répond souvent le jour même, et la question finit généralement par devenir une section.",
  helpCta: 'Poser une question',

  groups: [
    /* ------------------------------------------------------------ commencer */
    {
      id: 'start',
      title: 'Commencer',
      note: "Ce qu'est GreLines, comment l'ouvrir, comment l'installer sur son téléphone.",
      entries: [
        {
          id: 'ce-quest-grelines',
          icon: 'book',
          title: "Ce qu'est GreLines",
          note: 'Onze réseaux de Grenoble et de sa région, réunis dans une application gratuite, sans compte et sans publicité.',
          body: [
            {
              kind: 'p',
              text: "GreLines réunit les transports de Grenoble et de sa région dans une seule application web : tram, bus, TER, funiculaire, voitures et vélos partagés, covoiturage. On y lit les prochains passages d'un arrêt, on y calcule un itinéraire porte à porte, on y garde sa carte OùRA, et l'on y suit les perturbations des lignes qu'on prend.",
            },
            {
              kind: 'p',
              text: "Ce n'est pas un horaire imprimé. Les passages viennent des données que les exploitants publient en temps réel : un bus supprimé disparaît de la liste, un tram en retard annonce son retard.",
            },
            {
              kind: 'list',
              items: [
                { name: 'Gratuite', note: 'Aucun paiement, aucun essai limité, aucune publicité.' },
                { name: 'Sans compte', note: "Tout fonctionne sans inscription. Un compte ne sert qu'à retrouver ses favoris sur un autre appareil." },
                { name: 'Web', note: "Rien à télécharger sur un magasin. Une adresse suffit, et elle s'installe si vous le voulez." },
              ],
            },
          ],
        },
        {
          id: 'ouvrir',
          icon: 'play',
          title: "Ouvrir l'application",
          note: 'Une adresse, trois secondes, la carte et les arrêts autour de vous.',
          body: [
            { kind: 'p', text: "L'application se trouve à cette adresse :" },
            { kind: 'code', lang: 'txt', text: 'https://grelines.fr/app' },
            {
              kind: 'p',
              text: "Elle s'ouvre sur la carte. Si vous autorisez la localisation, les arrêts autour de vous apparaissent en premier ; sinon la carte s'ouvre sur le centre de Grenoble et la recherche prend le relais. Rien d'autre n'est demandé au premier lancement.",
            },
          ],
        },
        {
          id: 'installer',
          icon: 'download',
          title: "L'installer sur son téléphone",
          note: "Sur l'écran d'accueil, en plein écran, sans passer par un magasin d'applications.",
          body: [
            {
              kind: 'p',
              text: "GreLines est une application web installable. Posée sur l'écran d'accueil, elle s'ouvre en plein écran, sans barre d'adresse, et garde en mémoire de quoi démarrer même quand le réseau est mauvais.",
            },
            {
              kind: 'steps',
              items: [
                'Ouvrez grelines.fr/app dans le navigateur du téléphone.',
                "Sur iPhone, touchez le bouton Partager, puis « Sur l'écran d'accueil ». Sur Android, ouvrez le menu du navigateur, puis « Installer l'application ».",
                "Validez le nom proposé. L'icône se pose à côté des autres applications.",
              ],
            },
            {
              kind: 'note',
              text: "Installée, l'application affiche encore ses données mises en cache quand la connexion tombe. Les prochains passages, eux, ont besoin du réseau : hors ligne, ils datent du dernier chargement, et la date est indiquée.",
            },
          ],
        },
      ],
    },

    /* ------------------------------------------------ utiliser l'application */
    {
      id: 'usage',
      title: "Utiliser l'application",
      note: 'Les arrêts et les passages, les itinéraires, les favoris, la carte OùRA.',
      entries: [
        {
          id: 'arrets',
          icon: 'search',
          title: 'Trouver un arrêt, lire les passages',
          note: 'La recherche, la carte, et ce que veut dire chaque ligne de la liste.',
          body: [
            {
              kind: 'p',
              text: "Un arrêt se trouve de deux façons : en le cherchant par son nom, ou en le touchant sur la carte. Sa fiche donne les prochains passages, ligne par ligne, avec la direction annoncée par le véhicule.",
            },
            {
              kind: 'list',
              items: [
                { name: 'Une heure', note: "Le passage est théorique : l'exploitant ne publie pas encore de position pour cette course." },
                { name: 'Un décompte', note: 'Le passage est temps réel. Il se recalcule tout seul, environ toutes les quinze secondes.' },
                { name: 'Barré', note: "La course est supprimée. Elle reste visible un moment pour qu'on comprenne pourquoi le bus attendu n'arrive pas." },
                { name: 'Un pictogramme', note: 'Une information rattachée à la course : accessibilité, affluence signalée, correspondance.' },
              ],
            },
          ],
        },
        {
          id: 'itineraires',
          icon: 'route',
          title: 'Calculer un itinéraire',
          note: 'Porte à porte, plusieurs réseaux dans le même trajet, avec le guidage pas à pas.',
          body: [
            {
              kind: 'p',
              text: "Le calcul se fait d'un point à un autre, pas d'un arrêt à un autre : on entre une adresse, un lieu, un favori, ou l'on touche un point de la carte. La marche, le tram, le bus, le TER et le covoiturage entrent dans le même calcul, et un trajet peut donc changer de réseau sans qu'on ait à s'en occuper.",
            },
            {
              kind: 'steps',
              items: [
                "Ouvrez l'onglet des itinéraires et renseignez le départ et l'arrivée.",
                'Choisissez l’heure : partir maintenant, partir à, ou arriver avant.',
                "Comparez les propositions. Chacune indique sa durée, ses correspondances et ce qu'elle coûte quand le tarif est connu.",
                "Lancez le guidage : chaque correspondance est annoncée, et la descente est rappelée avant l'arrêt.",
              ],
            },
          ],
        },
        {
          id: 'favoris',
          icon: 'star',
          title: 'Favoris et trajets',
          note: "Vos arrêts et vos trajets en haut de l'écran, sur l'appareil ou sur le compte.",
          body: [
            {
              kind: 'p',
              text: "Un arrêt, une ligne ou un trajet complet peut être mis en favori. Les favoris remontent en haut de l'écran d'accueil, avec leurs prochains passages déjà chargés, ce qui évite de chercher deux fois par jour la même chose.",
            },
            {
              kind: 'p',
              text: "Sans compte, les favoris restent sur l'appareil et n'en sortent pas. Avec un compte, ils suivent d'un appareil à l'autre. C'est la seule différence que fait un compte.",
            },
          ],
        },
        {
          id: 'oura',
          icon: 'card',
          title: 'La carte OùRA',
          note: 'Photographiée une fois, consultable hors ligne, présentable au contrôle.',
          body: [
            {
              kind: 'p',
              text: "La carte OùRA se range dans l'application : on la photographie une fois, et son numéro, son titre et sa validité restent consultables ensuite, même sans réseau. Au contrôle, elle s'affiche en un geste depuis l'écran d'accueil.",
            },
            {
              kind: 'note',
              text: "L'application ne remplace pas la carte physique et ne valide pas un titre à bord. Elle vous évite de fouiller un portefeuille pour retrouver un numéro ou vérifier une date.",
            },
          ],
        },
        {
          id: 'trafic',
          icon: 'alert',
          title: 'Infotrafic, affluence, qualité de l’air',
          note: 'Ce que le réseau publie, ce que les voyageurs signalent, ce que la station mesure.',
          body: [
            {
              kind: 'list',
              items: [
                { name: 'Infotrafic', note: "Perturbations, travaux et déviations tels que l'exploitant les publie, rattachés aux lignes que vous suivez. Le texte n'est pas réécrit." },
                { name: 'Affluence', note: "Ce que les voyageurs signalent à bord, quand ils le signalent. C'est une indication, pas une mesure." },
                { name: 'Qualité de l’air', note: 'La mesure du jour pour la commune que vous regardez, reprise de la surveillance régionale.' },
              ],
            },
          ],
        },
      ],
    },

    /* ------------------------------------------------------ déployer chez soi */
    {
      id: 'deploy',
      title: 'Déployer GreLines',
      note: 'Cloner le dépôt, remplir les variables, préparer la base, mettre en ligne.',
      entries: [
        {
          id: 'avant-de-commencer',
          icon: 'clipboard',
          title: 'Avant de commencer',
          note: "Ce qu'il faut avoir sous la main pour faire tourner une instance à soi.",
          body: [
            {
              kind: 'p',
              text: "GreLines est une application web statique : un paquet de fichiers construits une fois, servis par n'importe quel hébergeur, plus deux petites fonctions serveur et une base Postgres. Rien qui demande une machine allumée en permanence.",
            },
            {
              kind: 'list',
              items: [
                { name: 'Node', note: 'Version 20 ou plus récente, avec npm. C’est le seul outil indispensable.' },
                { name: 'Une base Supabase', note: 'Un projet gratuit suffit pour démarrer. Il fournit la base Postgres et la clé publique du navigateur.' },
                { name: 'Un hébergeur', note: 'Vercel dans notre cas. Tout hébergeur qui sert un dossier statique fait l’affaire, à condition de savoir rediriger vers index.html.' },
                { name: 'Des clés de données', note: 'Facultatives. Sans elles, les réseaux qui les demandent restent simplement absents, et le reste fonctionne.' },
              ],
            },
          ],
        },
        {
          id: 'recuperer-le-code',
          icon: 'branch',
          title: 'Récupérer le code',
          note: 'Cloner le dépôt, installer les dépendances, et rien de plus.',
          body: [
            {
              kind: 'code',
              lang: 'bash',
              file: 'terminal',
              text: 'git clone https://github.com/antquu/GreLines.git\ncd GreLines\nnpm install',
            },
            {
              kind: 'p',
              text: "L'installation ne construit rien et ne contacte aucun service : elle télécharge les dépendances et s'arrête là. Vous pouvez déjà lancer le serveur de développement, l'application s'ouvrira, et seules les parties qui ont besoin d'une clé resteront vides.",
            },
          ],
        },
        {
          id: 'variables',
          icon: 'key',
          title: "Les variables d'environnement",
          note: 'Un fichier, une dizaine de lignes, et ce qui se passe quand il en manque une.',
          body: [
            {
              kind: 'p',
              text: "Les réglages vivent dans un fichier `.env` à la racine, jamais dans le dépôt. Le fichier `.env.example` en donne la forme ; copiez-le et remplissez ce que vous avez.",
            },
            {
              kind: 'code',
              lang: 'bash',
              file: 'terminal',
              text: 'cp .env.example .env',
            },
            {
              kind: 'code',
              lang: 'env',
              file: '.env',
              text: `# La base. Les deux seules variables vraiment nécessaires.
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-publique

# Le réseau lyonnais, servi par la plateforme ouverte du Grand Lyon.
GRANDLYON_USERNAME=
GRANDLYON_PASSWORD=

# Le VTC. Sans jeton, l'option ne s'affiche pas du tout.
UBER_API_TOKEN=
UBER_AUTH_SCHEME=

# Affichage. Le numéro de version et les crédits de l'écran « À propos ».
VITE_APP_VERSION=3.5.0
VITE_CREDITS=[]`,
            },
            {
              kind: 'list',
              items: [
                { name: 'VITE_', note: "Le préfixe qui dit à Vite d'embarquer la valeur dans le navigateur. Tout ce qui le porte est public : n'y mettez jamais un secret." },
                { name: 'Sans préfixe', note: "Reste côté serveur, dans les fonctions. C'est là que vont les mots de passe et les jetons." },
                { name: 'Une variable absente', note: 'Ne fait pas planter le démarrage. La fonctionnalité concernée se retire, et le reste marche.' },
              ],
            },
            {
              kind: 'note',
              text: "La clé publique Supabase est faite pour être lue par le navigateur : elle n'ouvre que ce que les règles de la base autorisent déjà. La clé de service, elle, n'a rien à faire dans ce fichier et n'y est jamais.",
            },
          ],
        },
        {
          id: 'preparer-la-base',
          icon: 'database',
          title: 'Préparer la base',
          note: 'Dix fichiers SQL à passer une fois, dans l’éditeur de votre projet.',
          body: [
            {
              kind: 'p',
              text: "Le dossier `supabase/` contient le schéma, découpé par sujet. Chaque fichier crée ses tables, ses index et ses règles d'accès, et se relance sans dommage : tout y est écrit en `create ... if not exists`.",
            },
            {
              kind: 'code',
              lang: 'txt',
              file: 'supabase/',
              text: `accounts.sql          les comptes et leurs porteurs
account-trips.sql     les trajets rattachés à un compte
oura-cards.sql        les cartes photographiées
blog.sql              les communiqués de la salle de presse
campaigns.sql         les affiches et le compte des scans
crowd-signals.sql     l'affluence signalée à bord
live-timing.sql       les corrections de passages
stop-surveys.sql      les avis sur les arrêts
trip-surveys.sql      les avis sur les trajets
translations.sql      les textes traduits`,
            },
            {
              kind: 'steps',
              items: [
                "Ouvrez l'éditeur SQL de votre projet Supabase.",
                'Collez le contenu de chaque fichier, un par un, et exécutez.',
                "Vérifiez que la sécurité au niveau des lignes est bien active sur chaque table créée : c'est elle qui fait que la clé publique ne donne pas plus que ce qu'elle doit.",
              ],
            },
            {
              kind: 'note',
              text: "Une instance sans base démarre quand même. Les horaires, les itinéraires et la carte viennent des sources ouvertes et n'en dépendent pas ; ce sont les comptes, les favoris synchronisés, les avis et la salle de presse qui resteront vides.",
            },
          ],
        },
        {
          id: 'lancer-en-local',
          icon: 'terminal',
          title: 'Lancer en local',
          note: 'Une commande, un port, et les adresses par lesquelles entrer.',
          body: [
            {
              kind: 'code',
              lang: 'bash',
              file: 'terminal',
              text: 'npm run dev',
            },
            {
              kind: 'p',
              text: "Le serveur écoute sur le port 5173. Les fonctions serveur sont servies par le même processus, à travers un greffon déclaré dans `vite.config.ts` : ce que vous testez en local emprunte donc le même chemin qu'en production.",
            },
            {
              kind: 'code',
              lang: 'txt',
              file: 'adresses',
              text: `http://localhost:5173/           l'application
http://localhost:5173/app/screen l'affichage plein écran
http://localhost:5173/fr         la vitrine
http://localhost:5173/fr/docs    cette documentation
http://localhost:5173/fr/newsroom la salle de presse`,
            },
            {
              kind: 'p',
              text: "Deux autres commandes servent au quotidien : `npm run build` construit le paquet de production dans `dist/` après avoir vérifié les types, et `npm run lint` passe le dépôt entier.",
            },
          ],
        },
        {
          id: 'mettre-en-ligne',
          icon: 'rocket',
          title: 'Mettre en ligne',
          note: 'Un dossier statique, deux fonctions, et une redirection qui fait tout tenir.',
          body: [
            {
              kind: 'p',
              text: "Le fichier `vercel.json` décrit déjà le déploiement : la commande de construction, le dossier de sortie, la redirection des adresses vers `index.html`, et les durées de cache. Il n'y a rien à écrire de plus.",
            },
            {
              kind: 'code',
              lang: 'json',
              file: 'vercel.json',
              text: `{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/((?!api/|llms.txt|robots.txt|sitemap.xml|sw.js|grelines.json).*)",
      "destination": "/index.html" }
  ]
}`,
            },
            {
              kind: 'p',
              text: "La redirection est la pièce importante. L'application n'a qu'une page, et c'est le navigateur qui décide quoi afficher selon l'adresse : sans cette règle, ouvrir `/fr/docs` directement rendrait une erreur, parce qu'aucun fichier ne porte ce nom. Les quelques adresses exclues sont celles qui doivent rester de vrais fichiers.",
            },
            {
              kind: 'steps',
              items: [
                'Poussez le dépôt sur votre hébergeur, ou pointez-le sur votre miroir git.',
                "Reportez les variables d'environnement dans les réglages du projet. Celles qui portent le préfixe VITE_ doivent être présentes au moment de la construction, pas seulement à l'exécution.",
                'Déployez. La construction prend quelques secondes.',
                "Vérifiez trois adresses : la racine, une adresse profonde comme `/fr/docs`, et une fonction comme `/api/tcl`. Si la deuxième répond, la redirection est bonne.",
              ],
            },
            {
              kind: 'note',
              text: "Sur un hébergeur qui n'exécute pas de fonctions, l'application se déploie quand même : les deux réseaux qui passent par elles disparaissent, tout le reste tient.",
            },
          ],
        },
      ],
    },

    /* -------------------------------------------------------- infrastructure */
    {
      id: 'infra',
      title: "L'infrastructure",
      note: 'De quoi le produit est fait, brique par brique, et ce qui tient sans nous.',
      entries: [
        {
          id: 'vue-densemble',
          icon: 'layers',
          title: "Vue d'ensemble",
          note: 'Quatre briques, et rien qui tourne en permanence.',
          body: [
            {
              kind: 'p',
              text: "L'architecture est volontairement pauvre. Il n'y a pas de serveur applicatif, pas de file de messages, pas de tâche de fond : un paquet statique dans le navigateur, deux fonctions appelées à la demande, une base gérée, et des sources ouvertes interrogées directement.",
            },
            {
              kind: 'code',
              lang: 'txt',
              file: 'architecture',
              text: `navigateur
  ├── application React servie en statique
  ├── appels directs aux sources ouvertes de mobilité
  ├── /api/tcl, /api/uber      fonctions serveur, à la demande
  └── base Postgres            comptes, avis, communiqués`,
            },
            {
              kind: 'p',
              text: "La conséquence tient en une phrase : l'essentiel de l'application continue de fonctionner même si tout ce qui nous appartient tombe. Les horaires ne passent pas par nous.",
            },
          ],
        },
        {
          id: 'le-front',
          icon: 'monitor',
          title: 'Le front',
          note: 'React, Vite, TypeScript, une seule page, et un routage lu dans l’adresse.',
          body: [
            {
              kind: 'list',
              items: [
                { name: 'React 19', note: 'Avec TypeScript en mode strict. Le typage est vérifié à chaque construction, avant que le paquet ne soit produit.' },
                { name: 'Vite 8', note: 'Serveur de développement et constructeur. Le découpage en morceaux est réglé à la main pour isoler React, les animations et la carte.' },
                { name: 'Tailwind 4', note: 'Pour la mise en page, doublé de feuilles écrites à la main pour la vitrine et pour cette documentation.' },
                { name: 'MapLibre GL', note: 'La carte, en rendu vectoriel. C’est le plus gros morceau du paquet, et il n’est chargé que par les pages qui en ont besoin.' },
              ],
            },
            {
              kind: 'p',
              text: "Il n'y a pas de bibliothèque de routage. Le fichier `src/main.tsx` lit l'adresse, la compare à quelques expressions régulières, et monte le composant qui correspond en le chargeant à la demande. La vitrine ne charge donc jamais la carte, et l'application ne charge jamais la documentation.",
            },
            {
              kind: 'code',
              lang: 'ts',
              file: 'src/main.tsx',
              text: `const docsRoute = /^\\/(fr|en)\\/docs\\/?$/.exec(window.location.pathname);

if (docsRoute) {
  void import('./landing/DocsPage').then(({ DocsPage }) => {
    root.render(<DocsPage lang={docsRoute[1]} />);
  });
}`,
            },
          ],
        },
        {
          id: 'fonctions-serveur',
          icon: 'server',
          title: 'Les fonctions serveur',
          note: 'Deux fichiers, et une seule raison d’exister : ce que le navigateur ne peut pas faire.',
          body: [
            {
              kind: 'p',
              text: "Le dossier `api/` contient deux fonctions. Elles ne sont pas là pour porter de la logique métier : elles existent parce que deux fournisseurs demandent une authentification qui ne peut pas vivre dans un navigateur, et parce qu’ils n’autorisent pas les appels venus d’un autre domaine.",
            },
            {
              kind: 'list',
              items: [
                { name: 'api/tcl.js', note: 'Le réseau lyonnais, servi par la plateforme ouverte du Grand Lyon, qui demande un compte. La fonction porte l’identifiant et rend la réponse.' },
                { name: 'api/uber.js', note: 'Les estimations VTC, qui demandent un jeton. Sans jeton, la fonction répond que l’option est indisponible, et l’interface ne la propose pas.' },
              ],
            },
            {
              kind: 'p',
              text: "En développement, ces deux fichiers ne sont pas servis par l'hébergeur mais par un greffon Vite déclaré dans `vite.config.ts`, qui relit le fichier d'environnement à chaque appel. Une clé ajoutée est donc prise en compte sans redémarrer quoi que ce soit.",
            },
          ],
        },
        {
          id: 'la-base',
          icon: 'database',
          title: 'La base de données',
          note: 'Postgres géré, seize tables, et des règles qui vivent dans la base plutôt que dans le code.',
          body: [
            {
              kind: 'p',
              text: "La base est un Postgres géré par Supabase, interrogé directement depuis le navigateur avec la clé publique. Ce qui rend cela acceptable n'est pas la clé, c'est que chaque table porte ses propres règles d'accès : un brouillon de communiqué n'est pas rendu à un visiteur, et ce n'est pas le code du site qui le décide, c'est la base qui refuse.",
            },
            {
              kind: 'code',
              lang: 'txt',
              file: 'tables',
              text: `oura_accounts, oura_holders, oura_cards, oura_account_trips
oura_notifications
blog_posts, popups, site_config
campaign_hits
crowd_signals, line_observations, line_overrides
stop_overrides, stop_surveys, trip_surveys
translations`,
            },
            {
              kind: 'p',
              text: "Un choix mérite d'être signalé : le corps d'un communiqué est stocké en tableau de blocs, pas en HTML. Le site public n'a donc jamais à injecter du balisage qu'il n'a pas écrit, la mise en forme reste la sienne quoi qu'on ait collé dans l'éditeur, et un type de bloc inconnu d'une ancienne version est ignoré au lieu de casser la page.",
            },
          ],
        },
        {
          id: 'les-sources',
          icon: 'plug',
          title: 'Les sources de données',
          note: 'D’où viennent les horaires, les adresses, les vélos et la qualité de l’air.',
          body: [
            {
              kind: 'p',
              text: "Aucune donnée de transport ne nous appartient et aucune n'est recopiée chez nous. L'application interroge les sources publiques au moment où vous regardez, ce qui explique la fraîcheur, et explique aussi qu'une panne chez un exploitant se voie tout de suite.",
            },
            {
              kind: 'list',
              items: [
                { name: 'Mobilités M', note: 'La source principale : arrêts, lignes, tracés, passages en temps réel, infotrafic et indice de qualité de l’air pour la métropole grenobloise.' },
                { name: 'Grand Lyon', note: 'Le réseau lyonnais, à travers la fonction serveur dédiée.' },
                { name: 'Airweb', note: 'Le réseau du Grésivaudan.' },
                { name: 'Adresses', note: 'Les bases publiques d’adresses et de communes, pour transformer une adresse tapée en point sur la carte.' },
              ],
            },
            {
              kind: 'note',
              text: "Quand un flux s'interrompt, l'application le dit sur les lignes concernées plutôt que d'afficher un horaire théorique à la place. Un horaire inventé serait pire qu'une absence, parce qu'on le croirait.",
            },
          ],
        },
        {
          id: 'cache-et-hors-ligne',
          icon: 'activity',
          title: 'Cache et hors ligne',
          note: 'Ce qui est gardé, pour combien de temps, et pourquoi ce n’est pas la même règle partout.',
          body: [
            {
              kind: 'p',
              text: "Trois niveaux de mémoire, avec des durées choisies séparément parce qu'ils ne vieillissent pas à la même vitesse.",
            },
            {
              kind: 'list',
              items: [
                { name: 'Les fichiers construits', note: 'Gardés un an, sans jamais être revérifiés. Leur nom contient une empreinte : une nouvelle version porte un nouveau nom, il n’y a donc rien à invalider.' },
                { name: 'La page d’entrée', note: 'Jamais gardée. C’est elle qui désigne les fichiers du jour, et une page d’entrée périmée ferait charger une version d’hier.' },
                { name: 'Les données', note: 'Gardées quelques minutes dans le navigateur, avec leur date. Hors ligne, elles s’affichent en disant leur âge plutôt que de laisser l’écran vide.' },
              ],
            },
            {
              kind: 'p',
              text: "Un agent de service, dans `public/sw.js`, sert la coquille de l'application quand la connexion tombe. Il ne fabrique pas de données : il évite l'écran blanc, et rend la main aux vraies requêtes dès que le réseau revient.",
            },
          ],
        },
      ],
    },

    /* ----------------------------------------------------- écrans et affiches */
    {
      id: 'ecrans',
      title: 'Écrans et affiches',
      note: "L'affichage plein écran dans un hall, et les affiches à QR code sur un poteau.",
      entries: [
        {
          id: 'screen',
          icon: 'monitor',
          title: 'GreLines Screen',
          note: "Les prochains passages d'un arrêt en plein écran, sur n'importe quel téléviseur.",
          body: [
            {
              kind: 'p',
              text: "GreLines Screen affiche les prochains passages d'un arrêt en très grands caractères, lisibles de loin. Un hall d'accueil, une salle des profs, un comptoir, un club sportif : tout ce qui a un écran et une connexion peut l'afficher.",
            },
            { kind: 'p', text: 'Rien à installer et rien à créer. Une adresse suffit :' },
            { kind: 'code', lang: 'txt', text: 'https://grelines.fr/app/screen' },
            {
              kind: 'p',
              text: "On y choisit l'arrêt une fois. L'adresse obtenue désigne ensuite cet arrêt pour de bon : elle se met en page d'accueil du navigateur, et l'écran retrouve son affichage tout seul après une coupure de courant.",
            },
          ],
        },
        {
          id: 'poser-un-ecran',
          icon: 'plug',
          title: 'Poser un écran',
          note: 'Ce qu’il faut sur place, et les réglages qui évitent d’y revenir.',
          body: [
            {
              kind: 'steps',
              items: [
                'Branchez ce que vous avez : un téléviseur récent suffit, un vieil ordinateur portable ou une tablette murale font tout aussi bien l’affaire.',
                "Ouvrez l'adresse de l'arrêt, puis passez le navigateur en plein écran.",
                "Réglez l'appareil pour qu'il ne se mette jamais en veille, et pour qu'il rouvre cette adresse au démarrage.",
                "Vérifiez la lecture depuis l'endroit d'où les gens regardent, pas depuis l'écran. C'est le seul réglage qui compte vraiment.",
              ],
            },
            {
              kind: 'note',
              text: "L'affichage s'actualise seul et ne demande aucune intervention. Un écran posé se laisse oublier, ce qui est exactement ce qu'on lui demande.",
            },
          ],
        },
        {
          id: 'affiches',
          icon: 'printer',
          title: 'Affiches et QR codes',
          note: 'Une adresse durable par arrêt, qui survit aux renommages, et le compte des scans.',
          body: [
            {
              kind: 'p',
              text: "Chaque arrêt peut recevoir une adresse courte, à imprimer en QR code sur un poteau ou dans un abribus. Cette adresse est durable : elle continue de désigner le bon arrêt même si le réseau renomme ses codes internes ou renumérote ses lignes, ce qui évite de réimprimer un parc d'affiches à chaque refonte.",
            },
            {
              kind: 'p',
              text: "Chaque affiche peut être comptée séparément. Vous savez alors quels poteaux servent et lesquels sont ignorés, ce qui est une information utile au moment de décider où en poser d'autres.",
            },
            {
              kind: 'note',
              text: 'Le comptage porte sur l’affiche, pas sur la personne : c’est un compteur de scans par emplacement, sans identifiant de visiteur.',
            },
          ],
        },
      ],
    },

    /* ------------------------------------------------------ raccorder un réseau */
    {
      id: 'reseaux',
      title: 'Raccorder un réseau',
      note: "Ce qu'un exploitant fournit, et comment se déroule la mise en service.",
      entries: [
        {
          id: 'prerequis',
          icon: 'clipboard',
          title: "Ce qu'il faut fournir",
          note: 'Un jeu d’horaires, un flux temps réel, un contact. Le reste se règle en marchant.',
          body: [
            {
              kind: 'p',
              text: "Raccorder un réseau ne demande pas de développement de votre côté. Il faut ce que vous produisez déjà pour vos propres outils, et une personne à qui poser des questions quand une donnée surprend.",
            },
            {
              kind: 'list',
              items: [
                { name: 'Les horaires', note: 'Votre jeu de données de référence au format d’échange courant du transport public, avec ses lignes, ses arrêts et son calendrier.' },
                { name: 'Le temps réel', note: 'Votre flux de passages et de perturbations, dans le format normalisé que publie déjà votre système d’aide à l’exploitation.' },
                { name: 'Les couleurs', note: 'Vos codes de lignes et vos couleurs officielles, pour que vos lignes ressemblent aux vôtres et pas à des lignes génériques.' },
                { name: 'Un contact', note: 'Une adresse technique et une adresse d’exploitation. Deux personnes suffisent.' },
              ],
            },
            {
              kind: 'note',
              text: "Si vos données sont déjà ouvertes sur un portail public, il n'y a rien à nous envoyer : dites-nous où elles sont, on part de là.",
            },
          ],
        },
        {
          id: 'raccorder',
          icon: 'network',
          title: 'Raccorder vos données',
          note: 'Le déroulé, du premier fichier reçu à vos lignes visibles dans l’application.',
          body: [
            {
              kind: 'steps',
              items: [
                'Vous nous indiquez où sont vos données, ou vous nous les transmettez.',
                'On les relit : cohérence des arrêts, correspondances, calendrier, comparaison avec le terrain sur quelques courses.',
                "On vous rend une liste de ce qui cloche, s'il y a lieu. C'est l'étape qui prend le plus de temps, et c'est normal : elle se fait une fois.",
                "Vos lignes apparaissent dans une version d'essai, que vous seuls voyez, le temps de la vérifier.",
                'Vous validez, et le réseau devient visible pour tout le monde.',
              ],
            },
            {
              kind: 'p',
              text: "Comptez quelques semaines entre le premier échange et la mise en service, l'essentiel du délai tenant à la relecture des données et à vos disponibilités.",
            },
          ],
        },
        {
          id: 'recette',
          icon: 'shield',
          title: 'Recette et mise en service',
          note: 'Ce qu’on vérifie avant d’ouvrir, et ce qui se passe quand le réseau change.',
          body: [
            {
              kind: 'p',
              text: "Avant l'ouverture, on vérifie ensemble un échantillon : des arrêts très fréquentés, des arrêts de bout de ligne, une correspondance, un jour de semaine, un dimanche, et un jour de perturbation si l'on en trouve un. Le but n'est pas de tout contrôler, mais de tomber sur les erreurs qui se répètent.",
            },
            {
              kind: 'p',
              text: "Ensuite, vos mises à jour sont reprises automatiquement : un changement d'horaires publié chez vous se retrouve dans l'application sans qu'il faille nous prévenir. Une refonte de réseau, en revanche, se prépare : prévenez-nous, on relit avant la bascule.",
            },
          ],
        },
      ],
    },

    /* ------------------------------------------------------ données et confiance */
    {
      id: 'donnees',
      title: 'Données et confiance',
      note: "Ce qui est conservé, où l'on exerce ses droits, et ce qui est garanti.",
      entries: [
        {
          id: 'ce-qui-est-conserve',
          icon: 'lock',
          title: 'Ce qui est conservé',
          note: 'Le principe : sans compte, presque rien ne quitte votre appareil.',
          body: [
            {
              kind: 'p',
              text: "L'application fonctionne sans compte, et dans ce cas vos favoris, vos recherches récentes et vos réglages restent sur l'appareil. Ils ne sont pas envoyés, et effacer les données du navigateur les efface pour de bon.",
            },
            {
              kind: 'p',
              text: "Avec un compte, il faut bien conserver quelque chose pour que vos favoris vous suivent d'un appareil à l'autre. C'est le seul but, et la politique de confidentialité dit précisément quoi.",
            },
            {
              kind: 'list',
              items: [
                { name: 'Position', note: 'Utilisée pour afficher les arrêts autour de vous, et pas enregistrée comme un historique de déplacements.' },
                { name: 'Publicité', note: 'Aucune régie, aucun traceur publicitaire, rien à revendre.' },
                { name: 'Carte OùRA', note: 'Ce que vous photographiez sert à l’affichage. La politique de confidentialité précise où cela vit.' },
              ],
            },
          ],
        },
        {
          id: 'grelines-data',
          icon: 'globe',
          title: 'GreLines Data',
          note: "Le guichet où l'on consulte ce qui est conservé, et où l'on en demande la suppression.",
          body: [
            {
              kind: 'p',
              text: "GreLines Data est la page où l'on exerce ses droits sans avoir à écrire une lettre : consulter ce qui est conservé, en demander une copie, en demander l'effacement.",
            },
            { kind: 'code', lang: 'txt', text: 'https://data.grelines.fr' },
            {
              kind: 'p',
              text: "Pour un réseau partenaire, c'est aussi l'endroit vers lequel renvoyer un voyageur qui pose la question, plutôt que de la traiter au guichet.",
            },
          ],
        },
        {
          id: 'securite',
          icon: 'shield',
          title: 'Sécurité',
          note: 'Ce qui est garanti, et ce qui ne s’écrit nulle part.',
          body: [
            {
              kind: 'p',
              text: "Les échanges passent en HTTPS. Les règles d'accès vivent dans la base et non dans le code de la page, ce qui veut dire qu'un navigateur modifié n'obtient pas davantage qu'un navigateur ordinaire. La clé embarquée dans la page est publique par construction et n'atteint que ce qui est déjà public.",
            },
            {
              kind: 'p',
              text: "L'architecture est décrite dans cette documentation, et c'est volontaire : un lecteur doit pouvoir la remonter chez lui. Ce qui n'y figure pas, et n'y figurera pas, ce sont les valeurs : aucune clé, aucune adresse de projet, aucun identifiant, aucun compte. Décrire une serrure est utile ; publier la clé ne l'est pas.",
            },
            {
              kind: 'note',
              text: "Si vous pensez avoir trouvé une faille, écrivez-nous avant d'en parler ailleurs. Un signalement de bonne foi ne vous vaudra jamais d'ennui, et il sera traité en priorité.",
            },
          ],
        },
      ],
    },

    /* ----------------------------------------------------- retours et référence */
    {
      id: 'reference',
      title: 'Retours et référence',
      note: "Signaler une erreur, vérifier l'état du service, nous écrire.",
      entries: [
        {
          id: 'donner-son-avis',
          icon: 'message',
          title: 'Donner son avis, signaler une erreur',
          note: 'Ce que l’application recueille, et comment le rendre utile.',
          body: [
            {
              kind: 'p',
              text: "Trois retours se donnent depuis l'application, sans compte à créer : l'affluence d'un véhicule au moment où l'on y est, un avis sur une ligne, un avis sur un arrêt. Ils remontent tels quels, et ils servent aux voyageurs suivants avant de servir à qui que ce soit d'autre.",
            },
            {
              kind: 'list',
              items: [
                { name: 'Affluence', note: 'Signalée à bord en un geste. C’est ce qui alimente l’indication d’affluence sur les prochains passages.' },
                { name: 'Lignes et arrêts', note: 'Un avis court, rattaché à la ligne ou à l’arrêt. Un abribus cassé, un afficheur éteint, un quai inaccessible.' },
                { name: 'Erreur de données', note: 'Ce qui se corrige le plus vite, à condition de savoir où regarder.' },
              ],
            },
            {
              kind: 'note',
              text: "Pour un signalement d'erreur, donnez l'arrêt et l'heure. C'est ce qui permet de retrouver la course en cause sans vous faire recommencer votre trajet, et c'est souvent la différence entre une correction dans la journée et un message qui reste sans suite.",
            },
          ],
        },
        {
          id: 'reseaux-desservis',
          icon: 'network',
          title: 'Réseaux desservis',
          note: "Onze réseaux, de la métropole au Grésivaudan, jusqu'à Lyon.",
          body: [
            {
              kind: 'list',
              items: [
                { name: 'Tram et bus', note: 'M réso, Tag, Tougo, Pays Voironnais, Bulles.' },
                { name: 'Train', note: 'Les TER qui desservent la cuvette, aux mêmes horaires que sur les quais.' },
                { name: 'Montagne', note: 'Transaltitude et le funiculaire des Petites Roches.' },
                { name: 'Partagé', note: 'Citiz, trottinettes en libre service, covoiturage M’Covoit.' },
                { name: 'Lyon', note: 'TCL, pour les trajets qui continuent au-delà de la métropole.' },
              ],
            },
          ],
        },
        {
          id: 'etat-du-service',
          icon: 'activity',
          title: 'État du service',
          note: 'Savoir si la panne vient de chez nous avant de chercher ailleurs.',
          body: [
            {
              kind: 'p',
              text: "Quand quelque chose ne répond pas, la page d'état dit ce qui fonctionne et ce qui ne fonctionne pas, sans qu'il faille écrire pour le demander.",
            },
            { kind: 'code', lang: 'txt', text: 'https://status.grelines.fr' },
            {
              kind: 'note',
              text: "Une donnée absente ne vient pas toujours de nous : quand le flux d'un exploitant s'interrompt, l'application le dit sur les lignes concernées plutôt que d'inventer un horaire.",
            },
          ],
        },
        {
          id: 'nous-ecrire',
          icon: 'mail',
          title: 'Nous écrire',
          note: 'Une adresse, une réponse rapide, et souvent une nouvelle section ensuite.',
          body: [
            {
              kind: 'p',
              text: "Une question sur l'application, un arrêt qui affiche n'importe quoi, un réseau qui voudrait rejoindre, un écran à poser dans un hall : la même adresse répond, et souvent le jour même.",
            },
            { kind: 'code', lang: 'txt', text: DOCS_EMAIL },
          ],
        },
      ],
    },
  ],
};

/* -------------------------------------------------------------------------
 * English.
 * ---------------------------------------------------------------------- */

const EN: DocsCopy = {
  eyebrow: 'Documentation',
  title: 'Using GreLines, and running your own',
  lead: 'How the app works, what it is made of, how to run it on your own machine, how a network connects its data. Every page describes what the product does today, not what it will do.',
  primary: 'Open GreLines',
  secondary: 'Write to us',
  searchLabel: 'Filter the contents',
  searchEmpty: 'Nothing matches.',
  tocTitle: 'Contents',
  tocToggle: 'Contents',
  sections: 'sections',
  browse: 'Browse',
  allCategories: 'All categories',
  previous: 'Previous',
  next: 'Next',
  copy: 'Copy',
  copied: 'Copied',
  helpTitle: 'Something missing?',
  helpBody:
    'This documentation grows with the product. If the answer you need is not here, write to us: we usually reply the same day, and the question usually ends up becoming a section.',
  helpCta: 'Ask a question',

  groups: [
    {
      id: 'start',
      title: 'Start',
      note: 'What GreLines is, how to open it, how to install it on a phone.',
      entries: [
        {
          id: 'ce-quest-grelines',
          icon: 'book',
          title: 'What GreLines is',
          note: 'Eleven networks around Grenoble in one free app, with no account and no ads.',
          body: [
            {
              kind: 'p',
              text: 'GreLines brings the transport of Grenoble and its region into a single web app: tram, bus, regional trains, funicular, shared cars and bikes, carpooling. You read a stop’s next departures, plan a door to door journey, keep your OùRA card, and follow disruptions on the lines you take.',
            },
            {
              kind: 'p',
              text: 'This is not a printed timetable. Departures come from what operators publish live: a cancelled bus disappears from the list, a late tram says it is late.',
            },
            {
              kind: 'list',
              items: [
                { name: 'Free', note: 'No payment, no limited trial, no advertising.' },
                { name: 'No account', note: 'Everything works without signing up. An account only carries your favourites to another device.' },
                { name: 'Web', note: 'Nothing to download from a store. One address is enough, and it installs if you want it to.' },
              ],
            },
          ],
        },
        {
          id: 'ouvrir',
          icon: 'play',
          title: 'Opening the app',
          note: 'One address, three seconds, the map and the stops around you.',
          body: [
            { kind: 'p', text: 'The app lives at this address:' },
            { kind: 'code', lang: 'txt', text: 'https://grelines.fr/app' },
            {
              kind: 'p',
              text: 'It opens on the map. Allow location and the stops around you come first; otherwise the map opens on central Grenoble and search takes over. Nothing else is asked on first launch.',
            },
          ],
        },
        {
          id: 'installer',
          icon: 'download',
          title: 'Installing it on a phone',
          note: 'On the home screen, full screen, without going through an app store.',
          body: [
            {
              kind: 'p',
              text: 'GreLines is an installable web app. Once on the home screen it opens full screen, with no address bar, and keeps enough in cache to start even on a poor connection.',
            },
            {
              kind: 'steps',
              items: [
                'Open grelines.fr/app in the phone browser.',
                'On iPhone, tap Share, then "Add to Home Screen". On Android, open the browser menu, then "Install app".',
                'Accept the suggested name. The icon lands next to your other apps.',
              ],
            },
            {
              kind: 'note',
              text: 'Once installed, the app still shows its cached data when the connection drops. Live departures do need the network: offline they date from the last load, and the time is shown.',
            },
          ],
        },
      ],
    },

    {
      id: 'usage',
      title: 'Using the app',
      note: 'Stops and departures, journeys, favourites, the OùRA card.',
      entries: [
        {
          id: 'arrets',
          icon: 'search',
          title: 'Finding a stop, reading departures',
          note: 'Search, the map, and what each line of the list actually means.',
          body: [
            {
              kind: 'p',
              text: 'There are two ways to a stop: search it by name, or tap it on the map. Its page gives the next departures line by line, with the destination the vehicle is announcing.',
            },
            {
              kind: 'list',
              items: [
                { name: 'A clock time', note: 'The departure is scheduled: the operator is not yet publishing a position for that run.' },
                { name: 'A countdown', note: 'The departure is live. It recomputes on its own, roughly every fifteen seconds.' },
                { name: 'Struck through', note: 'The run is cancelled. It stays visible for a while so you understand why the bus is not coming.' },
                { name: 'An icon', note: 'Something attached to the run: accessibility, reported crowding, a connection.' },
              ],
            },
          ],
        },
        {
          id: 'itineraires',
          icon: 'route',
          title: 'Planning a journey',
          note: 'Door to door, several networks in one trip, with turn by turn guidance.',
          body: [
            {
              kind: 'p',
              text: 'Planning goes from one point to another, not from one stop to another: enter an address, a place, a favourite, or tap the map. Walking, tram, bus, regional trains and carpooling all enter the same calculation, so a trip can change network without you having to think about it.',
            },
            {
              kind: 'steps',
              items: [
                'Open the journeys tab and fill in origin and destination.',
                'Choose the time: leave now, leave at, or arrive before.',
                'Compare the options. Each shows its duration, its connections, and its fare where the fare is known.',
                'Start guidance: every connection is announced, and your stop is called before you reach it.',
              ],
            },
          ],
        },
        {
          id: 'favoris',
          icon: 'star',
          title: 'Favourites and journeys',
          note: 'Your stops and trips at the top of the screen, on the device or on the account.',
          body: [
            {
              kind: 'p',
              text: 'A stop, a line or a whole journey can be saved. Favourites sit at the top of the home screen with their departures already loaded, which saves looking up the same thing twice a day.',
            },
            {
              kind: 'p',
              text: 'Without an account, favourites stay on the device and do not leave it. With an account they follow you from device to device. That is the only difference an account makes.',
            },
          ],
        },
        {
          id: 'oura',
          icon: 'card',
          title: 'The OùRA card',
          note: 'Photographed once, readable offline, ready for an inspection.',
          body: [
            {
              kind: 'p',
              text: 'Your OùRA card can live in the app: photograph it once, and its number, pass and validity stay readable afterwards, even with no network. During an inspection it comes up in one gesture from the home screen.',
            },
            {
              kind: 'note',
              text: 'The app does not replace the physical card and does not validate a fare on board. It saves you digging through a wallet to find a number or check a date.',
            },
          ],
        },
        {
          id: 'trafic',
          icon: 'alert',
          title: 'Service updates, crowding, air quality',
          note: 'What the network publishes, what riders report, what the monitoring station measures.',
          body: [
            {
              kind: 'list',
              items: [
                { name: 'Service updates', note: 'Disruptions, works and diversions exactly as the operator publishes them, attached to the lines you follow. The wording is not rewritten.' },
                { name: 'Crowding', note: 'What riders report on board, when they report it. It is an indication, not a measurement.' },
                { name: 'Air quality', note: "Today's reading for the town you are looking at, taken from regional monitoring." },
              ],
            },
          ],
        },
      ],
    },

    {
      id: 'deploy',
      title: 'Deploying GreLines',
      note: 'Clone the repository, fill in the variables, prepare the database, go live.',
      entries: [
        {
          id: 'avant-de-commencer',
          icon: 'clipboard',
          title: 'Before you start',
          note: 'What you need on hand to run an instance of your own.',
          body: [
            {
              kind: 'p',
              text: 'GreLines is a static web app: a bundle built once and served by any host, plus two small server functions and a Postgres database. Nothing that needs a machine left running.',
            },
            {
              kind: 'list',
              items: [
                { name: 'Node', note: 'Version 20 or newer, with npm. It is the only strictly required tool.' },
                { name: 'A Supabase project', note: 'A free one is enough to start. It provides the Postgres database and the public browser key.' },
                { name: 'A host', note: 'Vercel in our case. Any host that serves a static folder will do, as long as it can rewrite to index.html.' },
                { name: 'Data keys', note: 'Optional. Without them the networks that need them are simply absent, and everything else works.' },
              ],
            },
          ],
        },
        {
          id: 'recuperer-le-code',
          icon: 'branch',
          title: 'Getting the code',
          note: 'Clone the repository, install the dependencies, and nothing more.',
          body: [
            {
              kind: 'code',
              lang: 'bash',
              file: 'terminal',
              text: 'git clone https://github.com/antquu/GreLines.git\ncd GreLines\nnpm install',
            },
            {
              kind: 'p',
              text: 'Installing builds nothing and contacts no service: it downloads dependencies and stops there. You can already start the dev server, the app will open, and only the parts that need a key will stay empty.',
            },
          ],
        },
        {
          id: 'variables',
          icon: 'key',
          title: 'Environment variables',
          note: 'One file, about ten lines, and what happens when one is missing.',
          body: [
            {
              kind: 'p',
              text: 'Settings live in a `.env` file at the root, never in the repository. `.env.example` shows the shape; copy it and fill in what you have.',
            },
            { kind: 'code', lang: 'bash', file: 'terminal', text: 'cp .env.example .env' },
            {
              kind: 'code',
              lang: 'env',
              file: '.env',
              text: `# The database. The only two variables really needed.
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-key

# The Lyon network, served by the Grand Lyon open platform.
GRANDLYON_USERNAME=
GRANDLYON_PASSWORD=

# Ride hailing. With no token the option is not offered at all.
UBER_API_TOKEN=
UBER_AUTH_SCHEME=

# Display. Version number and the credits on the About screen.
VITE_APP_VERSION=3.5.0
VITE_CREDITS=[]`,
            },
            {
              kind: 'list',
              items: [
                { name: 'VITE_', note: 'The prefix that tells Vite to ship the value to the browser. Anything carrying it is public: never put a secret there.' },
                { name: 'No prefix', note: 'Stays on the server, inside the functions. That is where passwords and tokens go.' },
                { name: 'A missing variable', note: 'Does not break startup. The feature concerned withdraws, and the rest works.' },
              ],
            },
            {
              kind: 'note',
              text: 'The public Supabase key is meant to be read by the browser: it only opens what the database rules already allow. The service key has no place in this file and is never in it.',
            },
          ],
        },
        {
          id: 'preparer-la-base',
          icon: 'database',
          title: 'Preparing the database',
          note: 'Ten SQL files to run once, in your project’s editor.',
          body: [
            {
              kind: 'p',
              text: 'The `supabase/` folder holds the schema, split by subject. Each file creates its tables, indexes and access rules, and can be run again safely: everything is written as `create ... if not exists`.',
            },
            {
              kind: 'code',
              lang: 'txt',
              file: 'supabase/',
              text: `accounts.sql          accounts and their holders
account-trips.sql     trips attached to an account
oura-cards.sql        photographed cards
blog.sql              newsroom announcements
campaigns.sql         posters and scan counts
crowd-signals.sql     crowding reported on board
live-timing.sql       departure corrections
stop-surveys.sql      reviews of stops
trip-surveys.sql      reviews of journeys
translations.sql      translated strings`,
            },
            {
              kind: 'steps',
              items: [
                'Open the SQL editor of your Supabase project.',
                'Paste the contents of each file, one at a time, and run it.',
                'Check that row level security is enabled on every table created: that is what keeps the public key from giving more than it should.',
              ],
            },
            {
              kind: 'note',
              text: 'An instance with no database still starts. Timetables, journeys and the map come from open sources and do not depend on it; accounts, synced favourites, reviews and the newsroom are what stay empty.',
            },
          ],
        },
        {
          id: 'lancer-en-local',
          icon: 'terminal',
          title: 'Running it locally',
          note: 'One command, one port, and the addresses to enter by.',
          body: [
            { kind: 'code', lang: 'bash', file: 'terminal', text: 'npm run dev' },
            {
              kind: 'p',
              text: 'The server listens on port 5173. Server functions are served by the same process through a plugin declared in `vite.config.ts`, so what you test locally takes the same path as production.',
            },
            {
              kind: 'code',
              lang: 'txt',
              file: 'addresses',
              text: `http://localhost:5173/           the app
http://localhost:5173/app/screen the full screen display
http://localhost:5173/en         the marketing site
http://localhost:5173/en/docs    this documentation
http://localhost:5173/en/newsroom the newsroom`,
            },
            {
              kind: 'p',
              text: 'Two more commands earn their keep: `npm run build` produces the production bundle in `dist/` after checking types, and `npm run lint` covers the whole repository.',
            },
          ],
        },
        {
          id: 'mettre-en-ligne',
          icon: 'rocket',
          title: 'Going live',
          note: 'A static folder, two functions, and one rewrite that holds it together.',
          body: [
            {
              kind: 'p',
              text: '`vercel.json` already describes the deployment: build command, output folder, the rewrite that sends addresses to `index.html`, and cache durations. There is nothing more to write.',
            },
            {
              kind: 'code',
              lang: 'json',
              file: 'vercel.json',
              text: `{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/((?!api/|llms.txt|robots.txt|sitemap.xml|sw.js|grelines.json).*)",
      "destination": "/index.html" }
  ]
}`,
            },
            {
              kind: 'p',
              text: 'The rewrite is the important piece. The app has a single page, and the browser decides what to show from the address: without this rule, opening `/en/docs` directly would return an error, because no file has that name. The few excluded addresses are the ones that must stay real files.',
            },
            {
              kind: 'steps',
              items: [
                'Push the repository to your host, or point it at your git mirror.',
                'Copy the environment variables into the project settings. Those with the VITE_ prefix must be present at build time, not only at run time.',
                'Deploy. The build takes a few seconds.',
                'Check three addresses: the root, a deep one such as `/en/docs`, and a function such as `/api/tcl`. If the second answers, the rewrite is right.',
              ],
            },
            {
              kind: 'note',
              text: 'On a host that runs no functions the app still deploys: the two networks that go through them disappear, everything else holds.',
            },
          ],
        },
      ],
    },

    {
      id: 'infra',
      title: 'The infrastructure',
      note: 'What the product is made of, piece by piece, and what holds without us.',
      entries: [
        {
          id: 'vue-densemble',
          icon: 'layers',
          title: 'Overview',
          note: 'Four pieces, and nothing running permanently.',
          body: [
            {
              kind: 'p',
              text: 'The architecture is deliberately poor. There is no application server, no message queue, no background job: a static bundle in the browser, two functions called on demand, a managed database, and open sources queried directly.',
            },
            {
              kind: 'code',
              lang: 'txt',
              file: 'architecture',
              text: `browser
  ├── React app served statically
  ├── direct calls to open mobility sources
  ├── /api/tcl, /api/uber      server functions, on demand
  └── Postgres database        accounts, reviews, announcements`,
            },
            {
              kind: 'p',
              text: 'The consequence fits in one sentence: most of the app keeps working even if everything we own goes down. Timetables do not pass through us.',
            },
          ],
        },
        {
          id: 'le-front',
          icon: 'monitor',
          title: 'The front end',
          note: 'React, Vite, TypeScript, a single page, and routing read from the address.',
          body: [
            {
              kind: 'list',
              items: [
                { name: 'React 19', note: 'With TypeScript in strict mode. Types are checked on every build, before the bundle is produced.' },
                { name: 'Vite 8', note: 'Dev server and bundler. Chunking is set by hand to isolate React, animations and the map.' },
                { name: 'Tailwind 4', note: 'For layout, alongside hand written stylesheets for the marketing site and for this documentation.' },
                { name: 'MapLibre GL', note: 'The map, vector rendered. It is the largest piece of the bundle, and only pages that need it load it.' },
              ],
            },
            {
              kind: 'p',
              text: 'There is no routing library. `src/main.tsx` reads the address, matches it against a few regular expressions, and mounts the matching component by importing it on demand. So the marketing site never loads the map, and the app never loads the documentation.',
            },
            {
              kind: 'code',
              lang: 'ts',
              file: 'src/main.tsx',
              text: `const docsRoute = /^\\/(fr|en)\\/docs\\/?$/.exec(window.location.pathname);

if (docsRoute) {
  void import('./landing/DocsPage').then(({ DocsPage }) => {
    root.render(<DocsPage lang={docsRoute[1]} />);
  });
}`,
            },
          ],
        },
        {
          id: 'fonctions-serveur',
          icon: 'server',
          title: 'The server functions',
          note: 'Two files, and one reason to exist: what a browser cannot do.',
          body: [
            {
              kind: 'p',
              text: 'The `api/` folder holds two functions. They carry no business logic: they exist because two providers require credentials that cannot live in a browser, and because they do not allow calls from another domain.',
            },
            {
              kind: 'list',
              items: [
                { name: 'api/tcl.js', note: 'The Lyon network, served by the Grand Lyon open platform, which requires an account. The function carries the credential and returns the answer.' },
                { name: 'api/uber.js', note: 'Ride hailing estimates, which require a token. With no token the function reports the option unavailable, and the interface does not offer it.' },
              ],
            },
            {
              kind: 'p',
              text: 'In development these two files are served not by the host but by a Vite plugin declared in `vite.config.ts`, which re-reads the environment file on every call. A key you add is picked up without restarting anything.',
            },
          ],
        },
        {
          id: 'la-base',
          icon: 'database',
          title: 'The database',
          note: 'Managed Postgres, sixteen tables, and rules that live in the database rather than the code.',
          body: [
            {
              kind: 'p',
              text: 'The database is a Postgres managed by Supabase, queried straight from the browser with the public key. What makes that acceptable is not the key, it is that every table carries its own access rules: a draft announcement is not returned to a visitor, and it is not the site code deciding that, it is the database refusing.',
            },
            {
              kind: 'code',
              lang: 'txt',
              file: 'tables',
              text: `oura_accounts, oura_holders, oura_cards, oura_account_trips
oura_notifications
blog_posts, popups, site_config
campaign_hits
crowd_signals, line_observations, line_overrides
stop_overrides, stop_surveys, trip_surveys
translations`,
            },
            {
              kind: 'p',
              text: 'One choice is worth pointing out: the body of an announcement is stored as an array of blocks, not as HTML. The public site therefore never injects markup it did not write, formatting stays its own whatever was pasted into the editor, and a block type unknown to an older version is ignored instead of breaking the page.',
            },
          ],
        },
        {
          id: 'les-sources',
          icon: 'plug',
          title: 'The data sources',
          note: 'Where timetables, addresses, shared vehicles and air quality come from.',
          body: [
            {
              kind: 'p',
              text: 'No transport data is ours and none is copied to our side. The app queries public sources at the moment you look, which explains the freshness, and also explains why an operator outage is visible immediately.',
            },
            {
              kind: 'list',
              items: [
                { name: 'Mobilités M', note: 'The main source: stops, lines, shapes, live departures, service updates and the air quality index for the Grenoble area.' },
                { name: 'Grand Lyon', note: 'The Lyon network, through the dedicated server function.' },
                { name: 'Airweb', note: 'The Grésivaudan network.' },
                { name: 'Addresses', note: 'Public address and town databases, to turn a typed address into a point on the map.' },
              ],
            },
            {
              kind: 'note',
              text: 'When a feed stops, the app says so on the affected lines rather than showing a scheduled time instead. An invented time would be worse than an absence, because it would be believed.',
            },
          ],
        },
        {
          id: 'cache-et-hors-ligne',
          icon: 'activity',
          title: 'Cache and offline',
          note: 'What is kept, for how long, and why the rule is not the same everywhere.',
          body: [
            {
              kind: 'p',
              text: 'Three levels of memory, with durations chosen separately because they do not age at the same speed.',
            },
            {
              kind: 'list',
              items: [
                { name: 'Built files', note: 'Kept for a year and never revalidated. Their names carry a fingerprint: a new version has a new name, so there is nothing to invalidate.' },
                { name: 'The entry page', note: 'Never kept. It names the files of the day, and a stale entry page would load yesterday’s version.' },
                { name: 'Data', note: 'Kept a few minutes in the browser, with its timestamp. Offline it is shown with its age rather than leaving the screen blank.' },
              ],
            },
            {
              kind: 'p',
              text: 'A service worker in `public/sw.js` serves the shell of the app when the connection drops. It fabricates no data: it prevents the blank screen, and hands back to real requests as soon as the network returns.',
            },
          ],
        },
      ],
    },

    {
      id: 'ecrans',
      title: 'Screens and posters',
      note: 'The full screen display in a lobby, and QR code posters on a pole.',
      entries: [
        {
          id: 'screen',
          icon: 'monitor',
          title: 'GreLines Screen',
          note: "A stop's next departures full screen, on any television.",
          body: [
            {
              kind: 'p',
              text: "GreLines Screen shows a stop's next departures in very large type, readable from across a room. A lobby, a staff room, a counter, a sports club: anything with a screen and a connection can show it.",
            },
            { kind: 'p', text: 'Nothing to install and nothing to create. One address is enough:' },
            { kind: 'code', lang: 'txt', text: 'https://grelines.fr/app/screen' },
            {
              kind: 'p',
              text: 'You pick the stop once. The address you get then means that stop for good: set it as the browser home page and the screen finds its way back on its own after a power cut.',
            },
          ],
        },
        {
          id: 'poser-un-ecran',
          icon: 'plug',
          title: 'Putting a screen up',
          note: 'What you need on site, and the settings that save you coming back.',
          body: [
            {
              kind: 'steps',
              items: [
                'Plug in whatever you have: a recent television is enough, an old laptop or a wall tablet does the job just as well.',
                'Open the stop address, then put the browser in full screen.',
                'Set the device never to sleep, and to reopen that address on startup.',
                'Check readability from where people actually stand, not from the screen. It is the only setting that really matters.',
              ],
            },
            {
              kind: 'note',
              text: 'The display refreshes on its own and needs no attention. A screen that is up can be forgotten, which is exactly what is asked of it.',
            },
          ],
        },
        {
          id: 'affiches',
          icon: 'printer',
          title: 'Posters and QR codes',
          note: 'A durable address per stop that survives renamings, and a count of scans.',
          body: [
            {
              kind: 'p',
              text: 'Each stop can be given a short address, printed as a QR code on a pole or inside a shelter. That address is durable: it keeps pointing at the right stop even if the network renames its internal codes or renumbers its lines, so a whole set of posters does not have to be reprinted at every redesign.',
            },
            {
              kind: 'p',
              text: 'Each poster can be counted separately. You then know which poles are used and which are ignored, which is useful when deciding where to put the next ones.',
            },
            {
              kind: 'note',
              text: 'The count is about the poster, not the person: it is a scan counter per location, with no visitor identifier.',
            },
          ],
        },
      ],
    },

    {
      id: 'reseaux',
      title: 'Connecting a network',
      note: 'What an operator provides, and how going live unfolds.',
      entries: [
        {
          id: 'prerequis',
          icon: 'clipboard',
          title: 'What you need to provide',
          note: 'A timetable dataset, a live feed, a contact. The rest is settled as we go.',
          body: [
            {
              kind: 'p',
              text: 'Connecting a network needs no development on your side. It needs what you already produce for your own tools, plus somebody to ask when a piece of data looks odd.',
            },
            {
              kind: 'list',
              items: [
                { name: 'Timetables', note: 'Your reference dataset in the usual public transport exchange format, with its lines, stops and calendar.' },
                { name: 'Live data', note: 'Your departures and disruptions feed, in the standard format your operations system already publishes.' },
                { name: 'Colours', note: 'Your line codes and official colours, so your lines look like yours and not like generic ones.' },
                { name: 'A contact', note: 'One technical address and one operations address. Two people is enough.' },
              ],
            },
            {
              kind: 'note',
              text: 'If your data is already open on a public portal there is nothing to send us: tell us where it is and we start from there.',
            },
          ],
        },
        {
          id: 'raccorder',
          icon: 'network',
          title: 'Connecting your data',
          note: 'The sequence, from the first file received to your lines live in the app.',
          body: [
            {
              kind: 'steps',
              items: [
                'You tell us where your data is, or you send it to us.',
                'We read it: stop consistency, connections, calendar, and a comparison with the ground on a few runs.',
                'We send back a list of what does not add up, if anything does not. This is the longest step, and that is normal: it happens once.',
                'Your lines appear in a trial version only you can see, so you can check it.',
                'You approve, and the network becomes visible to everyone.',
              ],
            },
            {
              kind: 'p',
              text: 'Allow a few weeks between the first exchange and going live, most of the time being data review and your own availability.',
            },
          ],
        },
        {
          id: 'recette',
          icon: 'shield',
          title: 'Acceptance and going live',
          note: 'What gets checked before opening, and what happens when the network changes.',
          body: [
            {
              kind: 'p',
              text: 'Before opening we check a sample together: very busy stops, end of line stops, one connection, a weekday, a Sunday, and a disrupted day if we can find one. The point is not to check everything, but to catch the mistakes that repeat.',
            },
            {
              kind: 'p',
              text: 'After that your updates are picked up automatically: a timetable change published on your side reaches the app without telling us. A full network redesign is different: warn us, and we review before the switch.',
            },
          ],
        },
      ],
    },

    {
      id: 'donnees',
      title: 'Data and trust',
      note: 'What is kept, where rights are exercised, and what is guaranteed.',
      entries: [
        {
          id: 'ce-qui-est-conserve',
          icon: 'lock',
          title: 'What is kept',
          note: 'The principle: without an account, almost nothing leaves your device.',
          body: [
            {
              kind: 'p',
              text: 'The app works without an account, and in that case your favourites, recent searches and settings stay on the device. They are not sent anywhere, and clearing browser data clears them for good.',
            },
            {
              kind: 'p',
              text: 'With an account something has to be kept, otherwise favourites could not follow you from device to device. That is the only purpose, and the privacy policy says exactly what.',
            },
            {
              kind: 'list',
              items: [
                { name: 'Location', note: 'Used to show the stops around you, and not recorded as a movement history.' },
                { name: 'Advertising', note: 'No ad network, no advertising tracker, nothing to resell.' },
                { name: 'OùRA card', note: 'What you photograph is used for display. The privacy policy says where it lives.' },
              ],
            },
          ],
        },
        {
          id: 'grelines-data',
          icon: 'globe',
          title: 'GreLines Data',
          note: 'The desk where you see what is kept, and ask for it to be deleted.',
          body: [
            {
              kind: 'p',
              text: 'GreLines Data is the page where rights are exercised without having to write a letter: see what is kept, ask for a copy, ask for deletion.',
            },
            { kind: 'code', lang: 'txt', text: 'https://data.grelines.fr' },
            {
              kind: 'p',
              text: 'For a partner network it is also where to send a rider who asks the question, rather than handling it at a counter.',
            },
          ],
        },
        {
          id: 'securite',
          icon: 'shield',
          title: 'Security',
          note: 'What is guaranteed, and what is written nowhere.',
          body: [
            {
              kind: 'p',
              text: 'Traffic runs over HTTPS. Access rules live in the database rather than in the page code, which means a modified browser gets no more than an ordinary one. The key shipped in the page is public by design and reaches only what is already public.',
            },
            {
              kind: 'p',
              text: 'The architecture is described in this documentation, and that is deliberate: a reader should be able to rebuild it. What is not here, and will not be, are the values: no key, no project address, no credential, no account. Describing a lock is useful; publishing the key is not.',
            },
            {
              kind: 'note',
              text: 'If you think you have found a flaw, write to us before mentioning it anywhere else. A good faith report will never get you into trouble, and it will be handled first.',
            },
          ],
        },
      ],
    },

    {
      id: 'reference',
      title: 'Feedback and reference',
      note: 'Report an error, check service status, write to us.',
      entries: [
        {
          id: 'donner-son-avis',
          icon: 'message',
          title: 'Feedback and reporting errors',
          note: 'What the app collects, and how to make it useful.',
          body: [
            {
              kind: 'p',
              text: 'Three kinds of feedback are given from inside the app, with no account to create: how crowded a vehicle is while you are on it, a review of a line, a review of a stop. They go up as written, and they serve the next riders before they serve anyone else.',
            },
            {
              kind: 'list',
              items: [
                { name: 'Crowding', note: 'Reported on board in one gesture. It is what feeds the crowding indication on next departures.' },
                { name: 'Lines and stops', note: 'A short review attached to the line or the stop. A broken shelter, a dead display, an unreachable platform.' },
                { name: 'Data errors', note: 'The fastest thing to fix, provided we know where to look.' },
              ],
            },
            {
              kind: 'note',
              text: 'For a data error, give the stop and the time. That is what lets us find the run at fault without making you take the trip again, and it is often the difference between a same day fix and a message that goes nowhere.',
            },
          ],
        },
        {
          id: 'reseaux-desservis',
          icon: 'network',
          title: 'Networks served',
          note: 'Eleven networks, from the metropolitan area to the Grésivaudan, all the way to Lyon.',
          body: [
            {
              kind: 'list',
              items: [
                { name: 'Tram and bus', note: 'M réso, Tag, Tougo, Pays Voironnais, Bulles.' },
                { name: 'Train', note: 'The regional trains serving the valley, on the same timetable as the platforms.' },
                { name: 'Mountain', note: 'Transaltitude and the Petites Roches funicular.' },
                { name: 'Shared', note: 'Citiz, shared scooters, M’Covoit carpooling.' },
                { name: 'Lyon', note: 'TCL, for journeys that carry on beyond the metropolitan area.' },
              ],
            },
          ],
        },
        {
          id: 'etat-du-service',
          icon: 'activity',
          title: 'Service status',
          note: 'Knowing whether the fault is ours before looking anywhere else.',
          body: [
            {
              kind: 'p',
              text: 'When something does not answer, the status page says what is working and what is not, without having to write and ask.',
            },
            { kind: 'code', lang: 'txt', text: 'https://status.grelines.fr' },
            {
              kind: 'note',
              text: "Missing data is not always ours: when an operator's feed stops, the app says so on the affected lines rather than inventing a departure time.",
            },
          ],
        },
        {
          id: 'nous-ecrire',
          icon: 'mail',
          title: 'Writing to us',
          note: 'One address, a quick reply, and often a new section afterwards.',
          body: [
            {
              kind: 'p',
              text: 'A question about the app, a stop showing nonsense, a network that would like to join, a screen to put up in a lobby: the same address answers, often the same day.',
            },
            { kind: 'code', lang: 'txt', text: DOCS_EMAIL },
          ],
        },
      ],
    },
  ],
};

export const DOCS: Record<Lang, DocsCopy> = { fr: FR, en: EN };
