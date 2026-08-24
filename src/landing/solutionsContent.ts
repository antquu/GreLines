/**
 * Les six solutions, chacune avec sa page.
 *
 * Le menu « Solutions » de l'en-tête menait jusqu'ici à des ancres de la page
 * d'accueil, ou droit dans l'application. C'était court : quelqu'un qui clique
 * sur « Messages aux porteurs » veut lire ce que c'est, pas atterrir au milieu
 * d'une page qui parle d'autre chose. Chaque entrée a maintenant une adresse,
 * une page, et de quoi décider.
 *
 * Toutes les pages ont la même charpente, et c'est voulu. Six pages qui se
 * ressemblent se comparent ; six pages qui inventent chacune leur plan
 * obligent à réapprendre où regarder à chaque fois. La charpente :
 *
 *   une affirmation et un visuel        hero
 *   trois raisons, en une ligne         points
 *   quatre chiffres                     stats
 *   trois étapes, en images             steps
 *   quatre capacités, en images         features
 *   une bande large                     band
 *   trois détails                       gallery
 *   un appel                            final
 *
 * Soit douze emplacements d'images par solution, tous facultatifs : tant qu'un
 * fichier manque, son cadre disparaît et le texte se referme dessus. La page se
 * tient debout vide, et s'enrichit à mesure qu'on la remplit.
 *
 * Les identifiants d'adresse sont les mêmes en français et en anglais. Un lien
 * partagé reste donc valable quand son destinataire lit dans l'autre langue.
 */

import type { Lang } from './content';

export interface SolutionStep {
  title: string;
  body: string;
}

export interface SolutionCopy {
  /** Le segment d'adresse : `/fr/solutions/<slug>`. */
  slug: string;
  /** Le nom court, pour le menu et le fil d'Ariane. */
  name: string;

  eyebrow: string;
  title: string;
  lead: string;
  /**
   * Le visuel de tête, en chemin sous `/assets/homepage/`.
   *
   * Facultatif : sans lui, on cherche `solutions/<slug>/hero.png`. Le champ
   * existe parce que les montages déjà dessinés vivent dans `photos/`, avec
   * ceux de la page d'accueil, et qu'il vaut mieux pointer un fichier là où il
   * est que le recopier ailleurs pour satisfaire une convention.
   */
  hero?: string;
  /** Ce que montre le visuel de tête, pour ceux qui ne le voient pas. */
  heroAlt: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };

  /** Trois raisons, chacune ouverte par sa proposition en pleine encre. */
  points: { lead: string; rest: string }[];
  stats: { value: string; label: string }[];

  stepsTitle: string;
  stepsLead: string;
  /** Trois étapes, images `step-1` à `step-3`. */
  steps: SolutionStep[];

  featuresTitle: string;
  featuresLead: string;
  /** Quatre capacités, images `feature-1` à `feature-4`. */
  features: SolutionStep[];

  bandTitle: string;
  bandBody: string;
  /** Ce que montre la bande large, image `wide`. */
  bandAlt: string;

  galleryTitle: string;
  /** Trois détails, images `detail-1` à `detail-3`. */
  gallery: SolutionStep[];

  finalTitle: string;
  finalBody: string;
}

/** Les intitulés communs à toutes les pages de solution. */
export interface SolutionsChrome {
  eyebrow: string;
  /** Le titre de la liste, quand aucune solution n'est nommée. */
  indexTitle: string;
  indexLead: string;
  /** Le lien de retour, en fil d'Ariane. */
  home: string;
  /** Le titre du bloc qui renvoie vers les autres solutions. */
  othersTitle: string;
  othersLead: string;
  /** Le lien de la documentation, au pied de page. */
  docs: string;
  docsNote: string;
}

export const CHROME: Record<Lang, SolutionsChrome> = {
  fr: {
    eyebrow: 'Pour les réseaux',
    indexTitle: 'Six façons de vous servir de GreLines',
    indexLead:
      "Elles se posent séparément, et se complètent si vous en prenez plusieurs. Aucune ne demande de développement de votre côté.",
    home: 'Accueil',
    othersTitle: 'Les autres solutions',
    othersLead: 'Elles se posent séparément, et se complètent si vous en prenez plusieurs.',
    docs: 'Lire la documentation',
    docsNote: 'Le détail technique, les prérequis, et comment on raccorde vos données.',
  },
  en: {
    eyebrow: 'For networks',
    indexTitle: 'Six ways to put GreLines to work',
    indexLead:
      'They stand on their own, and they add up if you take several. None of them needs development on your side.',
    home: 'Home',
    othersTitle: 'The other solutions',
    othersLead: 'They stand on their own, and they add up if you take several.',
    docs: 'Read the documentation',
    docsNote: 'The technical detail, the prerequisites, and how your data gets connected.',
  },
};

/* -------------------------------------------------------------------------
 * Français.
 * ---------------------------------------------------------------------- */

const FR: SolutionCopy[] = [
  {
    slug: 'screen',
    name: 'GreLines Screen',
    eyebrow: 'Affichage',
    title: 'Les prochains passages, en grand, sur ce que vous avez déjà',
    lead: "Un téléviseur, un vieil ordinateur portable, une tablette au mur : GreLines Screen affiche les prochains passages d'un arrêt en plein écran, lisibles depuis le fond d'une salle. Rien à installer, aucun compte à créer, une adresse suffit.",
    hero: 'photos/screen.png',
    heroAlt: "Un téléviseur affichant les prochains passages d'un arrêt dans un hall",
    primary: { label: 'Ouvrir un écran', href: '/app/screen' },
    secondary: { label: 'Voir la documentation', href: '/fr/docs/ecrans/screen' },
    points: [
      { lead: 'Aucune installation', rest: "un navigateur suffit, sur n'importe quel appareil des dix dernières années." },
      { lead: 'Aucun compte', rest: "l'adresse est le seul réglage, et elle se colle en page d'accueil." },
      { lead: 'Aucun entretien', rest: "l'affichage se rafraîchit seul et revient tout seul après une coupure." },
    ],
    stats: [
      { value: '0 €', label: 'par écran, sans abonnement' },
      { value: '15 s', label: 'entre deux rafraîchissements' },
      { value: '2 min', label: 'entre le déballage et le premier passage affiché' },
      { value: '11', label: 'réseaux affichables' },
    ],
    stepsTitle: 'Trois gestes, une fois pour toutes',
    stepsLead: "Le but est qu'on n'y revienne jamais. Ces trois réglages sont ce qui fait la différence entre un écran qu'on oublie et un écran qu'on rallume tous les lundis.",
    steps: [
      {
        title: "Choisir l'arrêt",
        body: "Sur la page des écrans, cherchez votre arrêt et validez. L'adresse obtenue désigne cet arrêt pour de bon.",
      },
      {
        title: 'Ouvrir en plein écran',
        body: "Collez l'adresse dans le navigateur de l'appareil, puis passez en plein écran. La barre d'adresse disparaît, il ne reste que les passages.",
      },
      {
        title: 'Régler la veille',
        body: "Désactivez la mise en veille, et demandez à l'appareil de rouvrir cette adresse au démarrage. C'est ce qui le fait revivre seul après une panne de courant.",
      },
    ],
    featuresTitle: 'Ce que montre un écran',
    featuresLead: "Pas un tableau de bord : la seule chose qu'on vient y lire, en assez gros pour la lire de loin.",
    features: [
      {
        title: 'Les passages, en très grand',
        body: "Ligne, direction, minutes restantes. Les caractères sont dimensionnés pour être lus à cinq mètres, pas pour tenir le plus d'informations possible.",
      },
      {
        title: 'Le temps réel, pas la théorie',
        body: "Une course supprimée disparaît, un retard s'affiche. Quand le flux de l'exploitant s'interrompt, l'écran le dit au lieu d'inventer un horaire.",
      },
      {
        title: 'Les perturbations du jour',
        body: "Travaux, déviations et interruptions rattachés aux lignes de cet arrêt, dans les mots de l'exploitant.",
      },
      {
        title: "L'heure et la fraîcheur",
        body: "L'heure courante, et la date du dernier rafraîchissement. Un écran figé se repère alors en une seconde, sans avoir à le tester.",
      },
    ],
    bandTitle: 'Un hall, une salle des profs, un comptoir',
    bandBody:
      "Là où les gens attendent sans savoir combien de temps il leur reste. Une mairie, un collège, un hôpital, un centre sportif, une entreprise au bout d'une ligne de bus : partout où la question « je pars maintenant ou dans cinq minutes » se pose plusieurs fois par jour.",
    bandAlt: "Un écran d'affichage dans le hall d'un bâtiment public",
    galleryTitle: 'Les détails qui comptent',
    gallery: [
      {
        title: 'Lisible de loin',
        body: 'Fort contraste, pas de couleur décorative, aucune animation qui distrait au moment où on lit.',
      },
      {
        title: 'Plusieurs arrêts',
        body: "Un bâtiment desservi par deux arrêts affiche les deux, sur le même écran ou sur deux écrans côte à côte.",
      },
      {
        title: 'Adresse durable',
        body: "Elle survit aux renommages du réseau. Un écran posé cette année marche encore après une refonte de lignes.",
      },
    ],
    finalTitle: 'Branchez, collez, oubliez',
    finalBody:
      "Il n'y a rien à acheter et rien à signer pour essayer. Prenez un écran qui traîne, mettez-le dans le hall, et voyez si les gens s'arrêtent devant.",
  },

  {
    slug: 'affiches',
    name: 'Affiches et QR codes',
    eyebrow: 'Sur le terrain',
    title: "Une adresse par arrêt, qui survit aux refontes du réseau",
    lead: "Chaque arrêt peut recevoir une adresse courte, à imprimer en QR code sur un poteau ou dans un abribus. Scannée, elle ouvre les prochains passages de cet arrêt. Et elle continue de désigner le bon arrêt même si vous renommez vos codes internes.",
    hero: 'photos/qrcode.png',
    heroAlt: 'Un QR code imprimé sur un poteau d’arrêt de bus',
    primary: { label: 'Nous en parler', href: 'mailto:ant.adam468@gmail.com' },
    secondary: { label: 'Voir la documentation', href: '/fr/docs/ecrans/affiches' },
    points: [
      { lead: 'Durable', rest: "l'adresse ne dépend pas de vos identifiants internes, donc un renommage ne la casse pas." },
      { lead: 'Mesurable', rest: 'chaque affiche est comptée séparément, poteau par poteau.' },
      { lead: 'Anonyme', rest: "le comptage porte sur l'emplacement, jamais sur la personne qui scanne." },
    ],
    stats: [
      { value: '1', label: 'adresse par arrêt, définitive' },
      { value: '0', label: 'identifiant de visiteur enregistré' },
      { value: '3 s', label: 'entre le scan et les passages affichés' },
      { value: '∞', label: 'affiches par arrêt, comptées séparément' },
    ],
    stepsTitle: 'De la liste des arrêts au poteau',
    stepsLead: "La partie longue n'est pas technique : c'est de décider où poser les affiches. Le reste tient en une après-midi.",
    steps: [
      {
        title: 'Choisir les emplacements',
        body: "Vous nous donnez la liste des arrêts à équiper. Commencer par les vingt plus fréquentés donne déjà une idée de ce que ça change.",
      },
      {
        title: 'Recevoir les visuels',
        body: 'Un fichier prêt à imprimer par emplacement, au format de vos supports, avec le QR code et le nom de l’arrêt en clair.',
      },
      {
        title: 'Poser, puis regarder',
        body: "Les scans se comptent dès la première affiche posée. Au bout d'un mois, vous savez quels poteaux servent.",
      },
    ],
    featuresTitle: 'Ce que fait une affiche',
    featuresLead: "Elle remplace une information qui vieillit par une information qui ne vieillit pas.",
    features: [
      {
        title: 'Ouvre les passages du bon arrêt',
        body: "Directement, sans page intermédiaire, sans demander l'installation de quoi que ce soit.",
      },
      {
        title: 'Ne se périme pas',
        body: "Une fiche horaire imprimée est fausse au premier changement de service. Un QR code renvoie toujours vers ce qui est vrai maintenant.",
      },
      {
        title: 'Compte ses scans',
        body: "Par emplacement et par jour. On voit quels arrêts servent, à quelles heures, et dans quel sens.",
      },
      {
        title: 'Résiste au réseau',
        body: "Vous renumérotez une ligne, vous renommez un arrêt : les affiches déjà posées continuent de fonctionner.",
      },
    ],
    bandTitle: "L'information sans la vitrine",
    bandBody:
      "Un abribus sans afficheur électronique coûte cher à équiper et coûte cher à maintenir. Une feuille plastifiée avec un carré noir dessus coûte le prix de l'impression, et donne la même réponse à qui a un téléphone dans la poche.",
    bandAlt: 'Un abribus avec une affiche horaire et son QR code',
    galleryTitle: 'Les détails qui comptent',
    gallery: [
      {
        title: 'Vos couleurs',
        body: 'Le visuel reprend votre charte, vos codes de lignes et le nom que vos voyageurs emploient.',
      },
      {
        title: 'Lisible sale',
        body: "Le code est dimensionné pour rester scannable après un hiver, une pluie et deux autocollants collés à côté.",
      },
      {
        title: 'Une adresse courte',
        body: "Elle se lit et se tape à la main quand l'appareil photo refuse de coopérer.",
      },
    ],
    finalTitle: 'Vingt affiches pour voir',
    finalBody:
      "On prépare les visuels de vos vingt arrêts les plus fréquentés, vous les posez, et l'on regarde ensemble ce que ça donne au bout d'un mois.",
  },

  {
    slug: 'messages',
    name: 'Messages aux porteurs',
    eyebrow: 'Relation voyageur',
    title: 'Dire quelque chose à un porteur de carte, sans passer par sa boîte mail',
    lead: "Une perturbation sur sa ligne, un abonnement qui arrive à échéance, un mot du réseau : le message est adressé à une carte OùRA et se lit dans l'application, à l'endroit où la personne regarde déjà ses horaires.",
    hero: 'photos/notifications.png',
    heroAlt: "Un téléphone affichant une notification du réseau dans l'application",
    primary: { label: 'Nous en parler', href: 'mailto:ant.adam468@gmail.com' },
    secondary: { label: 'Voir la documentation', href: '/fr/docs/usage/oura' },
    points: [
      { lead: 'Au bon endroit', rest: "là où la personne consulte déjà, pas dans une boîte mail qu'elle ouvre le soir." },
      { lead: 'Au bon moment', rest: "rattaché à sa carte et à ses lignes, pas envoyé à toute la base." },
      { lead: 'Sans nouvelle adresse', rest: "rien à collecter : le lien passe par la carte, qui existe déjà." },
    ],
    stats: [
      { value: '0', label: 'adresse mail à collecter' },
      { value: '1', label: 'carte, un destinataire' },
      { value: '100 %', label: 'des messages consultables hors ligne' },
      { value: '0 €', label: 'par message envoyé' },
    ],
    stepsTitle: 'Comment un message arrive',
    stepsLead: "Le chemin est court, et il n'y a aucune donnée nouvelle à réunir pour l'emprunter.",
    steps: [
      {
        title: 'Le voyageur range sa carte',
        body: "Il la photographie une fois dans l'application. C'est ce geste, et lui seul, qui ouvre le canal.",
      },
      {
        title: 'Vous adressez le message',
        body: "À une carte, à un groupe de cartes, ou à tous les porteurs d'une ligne. Le texte est le vôtre, il n'est pas réécrit.",
      },
      {
        title: 'Il le lit dans son application',
        body: "Le message apparaît avec ses horaires, reste consultable ensuite, et se relit hors ligne.",
      },
    ],
    featuresTitle: 'Ce qu’on peut adresser',
    featuresLead: "Des choses utiles et datées, pas de la communication institutionnelle : c'est ce qui fait qu'on continue de les lire.",
    features: [
      {
        title: 'Une perturbation qui le concerne',
        body: "Sur la ligne qu'il prend, à l'heure où il la prend. Pas la liste des travaux de toute la métropole.",
      },
      {
        title: 'Un abonnement qui expire',
        body: "Quelques jours avant, avec ce qu'il faut faire. C'est le message qui évite le plus d'amendes.",
      },
      {
        title: 'Un changement de service',
        body: "Vacances scolaires, jour férié, nouvelle desserte. Ce qui surprend un habitué.",
      },
      {
        title: 'Un mot du réseau',
        body: "Une enquête, une concertation, une ouverture de ligne. Rare, donc lu.",
      },
    ],
    bandTitle: 'Un canal qui ne se revend pas',
    bandBody:
      "Il n'y a pas de régie publicitaire derrière, pas de traceur, et rien à monétiser. C'est ce qui permet de le laisser ouvert : le jour où un canal sert à autre chose qu'à informer, les gens le coupent, et il ne revient pas.",
    bandAlt: 'Une carte OùRA posée à côté d’un téléphone',
    galleryTitle: 'Les détails qui comptent',
    gallery: [
      {
        title: 'Coupable en un geste',
        body: "Le porteur peut fermer le canal quand il veut, depuis ses réglages, sans écrire à personne.",
      },
      {
        title: 'Consultable après coup',
        body: 'Les messages restent dans une liste. Une information lue en marchant se retrouve le soir.',
      },
      {
        title: 'Sans compte obligatoire',
        body: "Ranger sa carte ne demande pas de créer un compte. C'est ce qui fait que beaucoup le font.",
      },
    ],
    finalTitle: 'Parler à ceux qui vous lisent',
    finalBody:
      "Si vous avez déjà quelque chose à dire à vos porteurs et aucun moyen honnête de le faire, c'est exactement le problème que ça résout.",
  },

  {
    slug: 'retours',
    name: 'Retours voyageurs',
    eyebrow: 'Terrain',
    title: 'Ce que vos voyageurs voient, remonté au moment où ils le voient',
    lead: "L'affluence signalée à bord, un avis sur une ligne, un abribus cassé, un afficheur éteint. Trois gestes dans l'application, sans compte à créer, et une matière continue sur ce qui se passe vraiment sur le réseau.",
    heroAlt: 'Un voyageur signalant l’affluence depuis son téléphone dans un tram',
    primary: { label: 'Nous en parler', href: 'mailto:ant.adam468@gmail.com' },
    secondary: { label: 'Voir la documentation', href: '/fr/docs/reference/donner-son-avis' },
    points: [
      { lead: 'Sans compte', rest: "le seul moyen d'avoir du volume : une inscription coûte plus cher qu'un avis ne vaut." },
      { lead: 'Au moment même', rest: "signalé à bord, pas reconstitué de mémoire trois jours plus tard." },
      { lead: 'Utile tout de suite', rest: "l'affluence signalée sert au voyageur suivant avant de servir à vous." },
    ],
    stats: [
      { value: '1', label: 'geste pour signaler une affluence' },
      { value: '0', label: 'inscription demandée' },
      { value: '3', label: 'sortes de retours : affluence, ligne, arrêt' },
      { value: '24 h', label: 'de fenêtre pour corriger avant la remontée' },
    ],
    stepsTitle: 'Du signalement à la décision',
    stepsLead: "Un retour n'a de valeur que s'il redescend quelque part. Voilà le chemin qu'il fait.",
    steps: [
      {
        title: 'Le voyageur signale',
        body: "Depuis la fiche de l'arrêt ou depuis son trajet en cours. Une pression, pas un formulaire.",
      },
      {
        title: "Ça sert au suivant",
        body: "L'affluence signalée apparaît immédiatement sur les prochains passages de cette course. C'est ce qui donne envie de recommencer.",
      },
      {
        title: 'Vous le recevez groupé',
        body: 'Par ligne, par arrêt et par période, avec ce qui se répète mis en avant plutôt que noyé.',
      },
    ],
    featuresTitle: 'Ce qui remonte',
    featuresLead: 'Trois choses seulement. Un formulaire qui demande dix champs ne reçoit rien.',
    features: [
      {
        title: 'Affluence à bord',
        body: 'Vide, assis, debout, plein. Quatre niveaux, parce qu’au-delà personne ne choisit.',
      },
      {
        title: 'Avis sur une ligne',
        body: "Ponctualité, propreté, correspondance ratée. Court, daté, rattaché à la ligne.",
      },
      {
        title: 'État d’un arrêt',
        body: "Abri cassé, afficheur éteint, quai inaccessible, éclairage en panne. Ce qui se répare.",
      },
      {
        title: 'Erreur de données',
        body: "Un passage annoncé qui n'existe pas, un nom d'arrêt faux. Le retour qui se corrige le plus vite.",
      },
    ],
    bandTitle: 'La fréquentation que les compteurs ne voient pas',
    bandBody:
      "Un compteur de porte sait combien de personnes montent. Il ne sait pas qu'elles étaient debout, qu'une correspondance a été ratée, ni que l'abri est cassé depuis trois semaines. C'est cette moitié-là que les voyageurs racontent quand on leur laisse un bouton.",
    bandAlt: 'Un tram bondé aux heures de pointe',
    galleryTitle: 'Les détails qui comptent',
    gallery: [
      {
        title: 'Anonyme par défaut',
        body: "Aucun identifiant de personne n'est attaché à un signalement. C'est aussi ce qui les rend francs.",
      },
      {
        title: 'Le bruit se voit',
        body: "Un signalement isolé reste un signalement isolé. Ce qui remonte, c'est ce qui se répète.",
      },
      {
        title: 'Rien à installer',
        body: "Les voyageurs qui ont déjà l'application peuvent signaler dès aujourd'hui.",
      },
    ],
    finalTitle: 'Ouvrir le canal, puis regarder',
    finalBody:
      "Le dispositif tourne déjà. La question n'est pas de le construire, c'est de savoir si vous voulez lire ce qui en sort.",
  },

  {
    slug: 'data',
    name: 'GreLines Data',
    eyebrow: 'Conformité',
    title: 'Le guichet où vos voyageurs voient ce qui est conservé sur eux',
    lead: "Consulter, obtenir une copie, demander l'effacement. Une page publique, en libre accès, qui traite les demandes que votre guichet n'a pas envie de traiter et que votre juridique n'a pas envie de laisser sans réponse.",
    heroAlt: 'Un écran affichant la page de consultation des données personnelles',
    primary: { label: 'Ouvrir GreLines Data', href: 'https://data.grelines.fr' },
    secondary: { label: 'Voir la documentation', href: '/fr/docs/donnees/grelines-data' },
    points: [
      { lead: 'En libre accès', rest: "aucune demande à instruire à la main, aucune file à tenir." },
      { lead: 'Traçable', rest: "chaque demande laisse une trace datée, ce qui est précisément ce qu'on vous demandera." },
      { lead: 'Dans les délais', rest: 'une réponse immédiate vaut mieux que trente jours de délai légal.' },
    ],
    stats: [
      { value: '0', label: 'formulaire papier' },
      { value: '24/7', label: 'accessible sans guichet' },
      { value: '1', label: 'adresse à communiquer' },
      { value: '0 €', label: 'pour le voyageur' },
    ],
    stepsTitle: 'Ce que fait un voyageur',
    stepsLead: "Trois écrans, et il a la réponse. C'est ce qui évite le courrier recommandé.",
    steps: [
      {
        title: 'Il arrive avec sa question',
        body: "Depuis un lien que vous affichez, depuis l'application, ou depuis un moteur de recherche.",
      },
      {
        title: 'Il voit ce qui est conservé',
        body: 'La liste, en français, avec pourquoi chaque chose est là et combien de temps elle y reste.',
      },
      {
        title: 'Il décide',
        body: "Il en demande une copie, il en demande l'effacement, ou il referme la page rassuré. Les trois sont de bonnes issues.",
      },
    ],
    featuresTitle: 'Ce que la page couvre',
    featuresLead: 'Les droits qu’on exerce vraiment, pas la liste complète du règlement.',
    features: [
      {
        title: 'Accès',
        body: "Voir ce qui est conservé, en clair, sans avoir à interpréter une politique de confidentialité.",
      },
      {
        title: 'Portabilité',
        body: 'Obtenir une copie exploitable de ce qui vous concerne, dans un format ouvert.',
      },
      {
        title: 'Effacement',
        body: "Demander la suppression, et voir ce que ça implique avant de valider.",
      },
      {
        title: 'Explication',
        body: "Pourquoi telle donnée existe, à quoi elle sert, et ce qui se passe si on la retire.",
      },
    ],
    bandTitle: 'Une adresse à donner, plutôt qu’une procédure à écrire',
    bandBody:
      "La plupart des demandes ne sont pas des mises en demeure : ce sont des gens qui veulent savoir. Leur donner une page qui répond tout de suite règle la question avant qu'elle ne devienne un dossier, et laisse à votre juridique le petit nombre de cas qui le méritent.",
    bandAlt: 'Un comptoir d’accueil de réseau de transport',
    galleryTitle: 'Les détails qui comptent',
    gallery: [
      {
        title: 'Écrit pour être compris',
        body: "En français ordinaire. Une page de conformité que personne ne lit ne protège personne.",
      },
      {
        title: 'Séparé de l’application',
        body: "Sur son propre domaine, accessible même par quelqu'un qui n'utilise pas GreLines.",
      },
      {
        title: 'Daté',
        body: "Chaque demande porte sa date. C'est la première chose qu'on vous demandera de prouver.",
      },
    ],
    finalTitle: 'Une adresse, et le sujet est traité',
    finalBody:
      "Affichez-la sur vos supports, mettez-la dans vos conditions, et renvoyez-y les questions. C'est tout ce qu'il y a à faire.",
  },

  {
    slug: 'reseau',
    name: 'Intégrer votre réseau',
    eyebrow: 'Raccordement',
    title: 'Vos lignes dans l’application, à côté des onze réseaux déjà desservis',
    lead: "Vos arrêts, vos lignes, vos couleurs et votre temps réel, ajoutés à une application que vos voyageurs ont déjà. Aucun développement de votre côté : ce que vous produisez pour vos propres outils suffit.",
    heroAlt: 'Une carte du réseau avec plusieurs exploitants superposés',
    primary: { label: 'Nous en parler', href: 'mailto:ant.adam468@gmail.com' },
    secondary: { label: 'Voir la documentation', href: '/fr/docs/reseaux/prerequis' },
    points: [
      { lead: 'Sans développement', rest: "vos jeux de données existants, dans les formats que vous publiez déjà." },
      { lead: 'Sans exclusivité', rest: "vos propres outils continuent, celui-ci s'ajoute." },
      { lead: 'Sans rupture', rest: 'vos mises à jour sont reprises automatiquement une fois le raccordement fait.' },
    ],
    stats: [
      { value: '11', label: 'réseaux déjà raccordés' },
      { value: '3 000+', label: 'arrêts desservis' },
      { value: '0', label: 'ligne de code à écrire chez vous' },
      { value: '≈ 6', label: 'semaines entre le premier échange et l’ouverture' },
    ],
    stepsTitle: 'Comment ça se passe',
    stepsLead: "L'essentiel du délai n'est pas technique : c'est la relecture des données, et elle se fait une fois.",
    steps: [
      {
        title: 'Vous nous montrez vos données',
        body: "Une adresse de portail ouvert suffit. Si elles ne sont pas publiées, vous nous les transmettez.",
      },
      {
        title: 'On les relit',
        body: "Cohérence des arrêts, correspondances, calendrier, et comparaison avec le terrain sur quelques courses. On vous rend la liste de ce qui cloche.",
      },
      {
        title: 'Vous validez, on ouvre',
        body: "Vos lignes apparaissent d'abord dans une version d'essai que vous seuls voyez. Quand elle vous convient, le réseau devient visible.",
      },
    ],
    featuresTitle: 'Ce que vos voyageurs y gagnent',
    featuresLead: "Ce n'est pas une deuxième application de plus : c'est la fin d'une deuxième application.",
    features: [
      {
        title: 'Un seul endroit',
        body: "Un trajet qui commence sur votre réseau et finit sur un autre se calcule d'un coup, sans changer d'application.",
      },
      {
        title: 'Vos couleurs',
        body: 'Vos codes de lignes et votre charte, pour que vos voyageurs reconnaissent votre réseau.',
      },
      {
        title: 'Votre temps réel',
        body: "Les passages que votre système publie, affichés tels quels, rafraîchis toutes les quinze secondes.",
      },
      {
        title: 'Vos perturbations',
        body: "Vos messages d'infotrafic, dans vos mots, rattachés aux lignes concernées.",
      },
    ],
    bandTitle: 'Le voyageur ne connaît pas vos périmètres',
    bandBody:
      "Il sait qu'il part de chez lui et qu'il arrive au travail. Que ce soit trois autorités organisatrices et deux exploitants entre les deux ne l'intéresse pas, et lui demander de le savoir pour choisir la bonne application est le meilleur moyen de le laisser prendre sa voiture.",
    bandAlt: 'Un pôle d’échange avec plusieurs réseaux qui se croisent',
    galleryTitle: 'Les détails qui comptent',
    gallery: [
      {
        title: 'Vos données restent les vôtres',
        body: "Rien n'est recopié ni redistribué. On interroge vos sources au moment où le voyageur regarde.",
      },
      {
        title: 'Une panne se voit',
        body: "Quand votre flux s'interrompt, l'application le dit sur vos lignes plutôt que d'inventer un horaire.",
      },
      {
        title: 'Les refontes se préparent',
        body: 'Prévenez-nous avant une bascule de réseau, et la relecture se fait avant, pas après.',
      },
    ],
    finalTitle: 'Un premier échange suffit pour savoir',
    finalBody:
      "Dites-nous où sont vos données. En une semaine on vous dit ce qui marcherait tout de suite, et ce qui demanderait du travail.",
  },
];

/* -------------------------------------------------------------------------
 * English.
 * ---------------------------------------------------------------------- */

const EN: SolutionCopy[] = [
  {
    slug: 'screen',
    name: 'GreLines Screen',
    eyebrow: 'Display',
    title: 'Next departures, in large type, on whatever you already have',
    lead: 'A television, an old laptop, a tablet on the wall: GreLines Screen shows a stop’s next departures full screen, readable from the back of a room. Nothing to install, no account to create, one address is enough.',
    hero: 'photos/screen.png',
    heroAlt: 'A television showing a stop’s next departures in a lobby',
    primary: { label: 'Open a screen', href: '/app/screen' },
    secondary: { label: 'Read the documentation', href: '/en/docs/ecrans/screen' },
    points: [
      { lead: 'Nothing to install', rest: 'a browser is enough, on any device from the last ten years.' },
      { lead: 'No account', rest: 'the address is the only setting, and it becomes the browser home page.' },
      { lead: 'No upkeep', rest: 'the display refreshes itself and comes back on its own after a power cut.' },
    ],
    stats: [
      { value: '€0', label: 'per screen, no subscription' },
      { value: '15 s', label: 'between refreshes' },
      { value: '2 min', label: 'from unboxing to the first departure shown' },
      { value: '11', label: 'networks you can display' },
    ],
    stepsTitle: 'Three moves, once and for all',
    stepsLead: 'The point is never to come back. These three settings are the difference between a screen you forget and a screen you restart every Monday.',
    steps: [
      {
        title: 'Pick the stop',
        body: 'On the screens page, search your stop and confirm. The address you get means that stop for good.',
      },
      {
        title: 'Open it full screen',
        body: 'Paste the address into the device browser, then go full screen. The address bar disappears and only the departures are left.',
      },
      {
        title: 'Deal with sleep',
        body: 'Turn sleep off, and tell the device to reopen that address on startup. That is what brings it back on its own after an outage.',
      },
    ],
    featuresTitle: 'What a screen shows',
    featuresLead: 'Not a dashboard: the one thing people come to read, big enough to read from a distance.',
    features: [
      {
        title: 'Departures, very large',
        body: 'Line, destination, minutes left. Type is sized to be read from five metres, not to fit as much information as possible.',
      },
      {
        title: 'Live, not scheduled',
        body: 'A cancelled run disappears, a delay is shown. When the operator’s feed stops, the screen says so instead of inventing a time.',
      },
      {
        title: 'Today’s disruptions',
        body: 'Works, diversions and interruptions attached to the lines at that stop, in the operator’s own words.',
      },
      {
        title: 'Time and freshness',
        body: 'The current time, and when the display last refreshed. A frozen screen is then spotted in a second, without testing it.',
      },
    ],
    bandTitle: 'A lobby, a staff room, a counter',
    bandBody:
      'Wherever people wait without knowing how long they have. A town hall, a school, a hospital, a sports centre, a company at the end of a bus line: anywhere the question "do I leave now or in five minutes" comes up several times a day.',
    bandAlt: 'A display screen in the lobby of a public building',
    galleryTitle: 'The details that matter',
    gallery: [
      {
        title: 'Readable from afar',
        body: 'High contrast, no decorative colour, no animation to distract at the moment of reading.',
      },
      {
        title: 'Several stops',
        body: 'A building served by two stops shows both, on one screen or on two side by side.',
      },
      {
        title: 'Durable address',
        body: 'It survives network renamings. A screen put up this year still works after a line redesign.',
      },
    ],
    finalTitle: 'Plug it in, paste, forget',
    finalBody:
      'There is nothing to buy and nothing to sign to try it. Take a spare screen, put it in the lobby, and see whether people stop in front of it.',
  },

  {
    slug: 'affiches',
    name: 'Posters and QR codes',
    eyebrow: 'On the ground',
    title: 'One address per stop, surviving every network redesign',
    lead: 'Each stop can be given a short address, printed as a QR code on a pole or inside a shelter. Scanned, it opens that stop’s next departures. And it keeps pointing at the right stop even when you rename your internal codes.',
    hero: 'photos/qrcode.png',
    heroAlt: 'A QR code printed on a bus stop pole',
    primary: { label: 'Talk to us', href: 'mailto:ant.adam468@gmail.com' },
    secondary: { label: 'Read the documentation', href: '/en/docs/ecrans/affiches' },
    points: [
      { lead: 'Durable', rest: 'the address does not depend on your internal identifiers, so a renaming does not break it.' },
      { lead: 'Measurable', rest: 'every poster is counted separately, pole by pole.' },
      { lead: 'Anonymous', rest: 'the count is about the location, never about the person scanning.' },
    ],
    stats: [
      { value: '1', label: 'address per stop, permanent' },
      { value: '0', label: 'visitor identifier recorded' },
      { value: '3 s', label: 'from scan to departures shown' },
      { value: '∞', label: 'posters per stop, counted separately' },
    ],
    stepsTitle: 'From the stop list to the pole',
    stepsLead: 'The long part is not technical: it is deciding where the posters go. The rest takes an afternoon.',
    steps: [
      {
        title: 'Choose the locations',
        body: 'You give us the list of stops to equip. Starting with the twenty busiest already shows what it changes.',
      },
      {
        title: 'Receive the artwork',
        body: 'One print ready file per location, sized for your holders, with the QR code and the stop name in plain text.',
      },
      {
        title: 'Put them up, then watch',
        body: 'Scans are counted from the first poster onwards. After a month you know which poles are used.',
      },
    ],
    featuresTitle: 'What a poster does',
    featuresLead: 'It replaces information that ages with information that does not.',
    features: [
      {
        title: 'Opens the right stop',
        body: 'Directly, with no landing page in between, and nothing to install.',
      },
      {
        title: 'Never goes stale',
        body: 'A printed timetable is wrong at the first service change. A QR code always points at what is true now.',
      },
      {
        title: 'Counts its scans',
        body: 'Per location and per day. You see which stops are used, at what hours, and in which direction.',
      },
      {
        title: 'Survives the network',
        body: 'You renumber a line, you rename a stop: the posters already up keep working.',
      },
    ],
    bandTitle: 'Information without the display case',
    bandBody:
      'A shelter with no electronic display is expensive to equip and expensive to maintain. A laminated sheet with a black square on it costs the price of printing, and gives the same answer to anyone with a phone in their pocket.',
    bandAlt: 'A bus shelter with a timetable poster and its QR code',
    galleryTitle: 'The details that matter',
    gallery: [
      {
        title: 'Your colours',
        body: 'The artwork uses your brand, your line codes and the name your riders actually say.',
      },
      {
        title: 'Readable dirty',
        body: 'The code is sized to stay scannable after a winter, a rainstorm and two stickers pasted next to it.',
      },
      {
        title: 'A short address',
        body: 'It can be read and typed by hand when the camera refuses to cooperate.',
      },
    ],
    finalTitle: 'Twenty posters to find out',
    finalBody:
      'We prepare the artwork for your twenty busiest stops, you put them up, and we look together at what happens after a month.',
  },

  {
    slug: 'messages',
    name: 'Messages to cardholders',
    eyebrow: 'Rider relations',
    title: 'Telling a cardholder something, without going through their inbox',
    lead: 'A disruption on their line, a pass about to expire, a word from the network: the message is addressed to an OùRA card and read inside the app, where the person is already looking at their departures.',
    hero: 'photos/notifications.png',
    heroAlt: 'A phone showing a network notification inside the app',
    primary: { label: 'Talk to us', href: 'mailto:ant.adam468@gmail.com' },
    secondary: { label: 'Read the documentation', href: '/en/docs/usage/oura' },
    points: [
      { lead: 'In the right place', rest: 'where the person already looks, not in an inbox they open in the evening.' },
      { lead: 'At the right time', rest: 'tied to their card and their lines, not blasted to the whole database.' },
      { lead: 'No new address', rest: 'nothing to collect: the link goes through the card, which already exists.' },
    ],
    stats: [
      { value: '0', label: 'email address to collect' },
      { value: '1', label: 'card, one recipient' },
      { value: '100 %', label: 'of messages readable offline' },
      { value: '€0', label: 'per message sent' },
    ],
    stepsTitle: 'How a message arrives',
    stepsLead: 'The path is short, and there is no new data to gather in order to take it.',
    steps: [
      {
        title: 'The rider stores their card',
        body: 'They photograph it once in the app. That gesture, and only that gesture, opens the channel.',
      },
      {
        title: 'You address the message',
        body: 'To one card, to a group of cards, or to every holder on a line. The wording is yours and is not rewritten.',
      },
      {
        title: 'They read it in the app',
        body: 'The message appears with their departures, stays available afterwards, and can be reread offline.',
      },
    ],
    featuresTitle: 'What you can send',
    featuresLead: 'Useful, dated things, not institutional communication: that is what keeps them being read.',
    features: [
      {
        title: 'A disruption that concerns them',
        body: 'On the line they take, at the hour they take it. Not the works list for the whole area.',
      },
      {
        title: 'An expiring pass',
        body: 'A few days ahead, with what to do about it. The message that prevents the most fines.',
      },
      {
        title: 'A service change',
        body: 'School holidays, a public holiday, a new route. What catches a regular out.',
      },
      {
        title: 'A word from the network',
        body: 'A survey, a consultation, a line opening. Rare, therefore read.',
      },
    ],
    bandTitle: 'A channel that is not resold',
    bandBody:
      'There is no ad network behind it, no tracker, and nothing to monetise. That is what makes it possible to leave it open: the day a channel serves anything other than informing, people cut it off, and it does not come back.',
    bandAlt: 'An OùRA card next to a phone',
    galleryTitle: 'The details that matter',
    gallery: [
      {
        title: 'Switched off in one gesture',
        body: 'The holder can close the channel whenever they like, from their settings, without writing to anyone.',
      },
      {
        title: 'Available afterwards',
        body: 'Messages stay in a list. Something read while walking can be found again that evening.',
      },
      {
        title: 'No account required',
        body: 'Storing a card needs no sign up. That is why many people do it.',
      },
    ],
    finalTitle: 'Speaking to the people who read you',
    finalBody:
      'If you already have something to tell your cardholders and no honest way to do it, that is exactly the problem this solves.',
  },

  {
    slug: 'retours',
    name: 'Rider feedback',
    eyebrow: 'Ground truth',
    title: 'What your riders see, reported at the moment they see it',
    lead: 'Crowding reported on board, a review of a line, a broken shelter, a dead display. Three gestures in the app, with no account to create, and a continuous stream of what is actually happening on the network.',
    heroAlt: 'A rider reporting crowding from their phone on a tram',
    primary: { label: 'Talk to us', href: 'mailto:ant.adam468@gmail.com' },
    secondary: { label: 'Read the documentation', href: '/en/docs/reference/donner-son-avis' },
    points: [
      { lead: 'No account', rest: 'the only way to get volume: signing up costs more than a review is worth.' },
      { lead: 'In the moment', rest: 'reported on board, not reconstructed from memory three days later.' },
      { lead: 'Useful immediately', rest: 'reported crowding serves the next rider before it serves you.' },
    ],
    stats: [
      { value: '1', label: 'gesture to report crowding' },
      { value: '0', label: 'sign up required' },
      { value: '3', label: 'kinds of feedback: crowding, line, stop' },
      { value: '24 h', label: 'window to correct before it is reported' },
    ],
    stepsTitle: 'From report to decision',
    stepsLead: 'Feedback is only worth something if it lands somewhere. Here is the path it takes.',
    steps: [
      {
        title: 'The rider reports',
        body: 'From the stop page or from their journey in progress. One tap, not a form.',
      },
      {
        title: 'It serves the next rider',
        body: 'Reported crowding appears immediately on that run’s next departures. That is what makes people do it again.',
      },
      {
        title: 'You receive it grouped',
        body: 'By line, by stop and by period, with what repeats brought forward rather than buried.',
      },
    ],
    featuresTitle: 'What comes back',
    featuresLead: 'Three things only. A form asking for ten fields receives nothing.',
    features: [
      {
        title: 'Crowding on board',
        body: 'Empty, seated, standing, full. Four levels, because beyond that nobody chooses.',
      },
      {
        title: 'A review of a line',
        body: 'Punctuality, cleanliness, a missed connection. Short, dated, attached to the line.',
      },
      {
        title: 'The state of a stop',
        body: 'Broken shelter, dead display, unreachable platform, lighting out. Things that get repaired.',
      },
      {
        title: 'A data error',
        body: 'A departure announced that does not exist, a wrong stop name. The fastest thing to fix.',
      },
    ],
    bandTitle: 'The ridership counters cannot see',
    bandBody:
      'A door counter knows how many people boarded. It does not know that they were standing, that a connection was missed, or that the shelter has been broken for three weeks. That is the half riders tell you about when you leave them a button.',
    bandAlt: 'A crowded tram at rush hour',
    galleryTitle: 'The details that matter',
    gallery: [
      {
        title: 'Anonymous by default',
        body: 'No personal identifier is attached to a report. That is also what makes them frank.',
      },
      {
        title: 'Noise is visible',
        body: 'An isolated report stays an isolated report. What comes up is what repeats.',
      },
      {
        title: 'Nothing to install',
        body: 'Riders who already have the app can start reporting today.',
      },
    ],
    finalTitle: 'Open the channel, then look',
    finalBody:
      'The mechanism already runs. The question is not building it, it is whether you want to read what comes out.',
  },

  {
    slug: 'data',
    name: 'GreLines Data',
    eyebrow: 'Compliance',
    title: 'The desk where your riders see what is kept about them',
    lead: 'View it, get a copy, ask for deletion. A public page, freely accessible, handling the requests your counter would rather not handle and your legal team would rather not leave unanswered.',
    heroAlt: 'A screen showing the personal data page',
    primary: { label: 'Open GreLines Data', href: 'https://data.grelines.fr' },
    secondary: { label: 'Read the documentation', href: '/en/docs/donnees/grelines-data' },
    points: [
      { lead: 'Self service', rest: 'no request to process by hand, no queue to keep.' },
      { lead: 'Traceable', rest: 'every request leaves a dated trace, which is precisely what you will be asked for.' },
      { lead: 'Within deadlines', rest: 'an immediate answer beats a thirty day statutory limit.' },
    ],
    stats: [
      { value: '0', label: 'paper form' },
      { value: '24/7', label: 'available with no counter' },
      { value: '1', label: 'address to publish' },
      { value: '€0', label: 'for the rider' },
    ],
    stepsTitle: 'What a rider does',
    stepsLead: 'Three screens and they have their answer. That is what avoids the registered letter.',
    steps: [
      {
        title: 'They arrive with a question',
        body: 'From a link you display, from the app, or from a search engine.',
      },
      {
        title: 'They see what is kept',
        body: 'The list, in plain language, with why each item is there and how long it stays.',
      },
      {
        title: 'They decide',
        body: 'They ask for a copy, they ask for deletion, or they close the page reassured. All three are good outcomes.',
      },
    ],
    featuresTitle: 'What the page covers',
    featuresLead: 'The rights people actually exercise, not the full text of the regulation.',
    features: [
      {
        title: 'Access',
        body: 'See what is kept, in plain terms, without having to interpret a privacy policy.',
      },
      {
        title: 'Portability',
        body: 'Get a usable copy of what concerns you, in an open format.',
      },
      {
        title: 'Erasure',
        body: 'Ask for deletion, and see what it implies before confirming.',
      },
      {
        title: 'Explanation',
        body: 'Why a given item exists, what it is for, and what happens if it is removed.',
      },
    ],
    bandTitle: 'An address to give, rather than a procedure to write',
    bandBody:
      'Most requests are not formal notices: they are people who want to know. Giving them a page that answers straight away settles the question before it becomes a case file, and leaves your legal team the small number that deserve it.',
    bandAlt: 'A transit network information counter',
    galleryTitle: 'The details that matter',
    gallery: [
      {
        title: 'Written to be understood',
        body: 'In ordinary language. A compliance page nobody reads protects nobody.',
      },
      {
        title: 'Separate from the app',
        body: 'On its own domain, reachable even by someone who does not use GreLines.',
      },
      {
        title: 'Dated',
        body: 'Every request carries its date. That is the first thing you will be asked to prove.',
      },
    ],
    finalTitle: 'One address, and the subject is handled',
    finalBody:
      'Put it on your materials, put it in your terms, and send questions there. That is all there is to do.',
  },

  {
    slug: 'reseau',
    name: 'Add your network',
    eyebrow: 'Connection',
    title: 'Your lines in the app, alongside the eleven networks already served',
    lead: 'Your stops, your lines, your colours and your live data, added to an app your riders already have. No development on your side: what you produce for your own tools is enough.',
    heroAlt: 'A network map with several operators overlaid',
    primary: { label: 'Talk to us', href: 'mailto:ant.adam468@gmail.com' },
    secondary: { label: 'Read the documentation', href: '/en/docs/reseaux/prerequis' },
    points: [
      { lead: 'No development', rest: 'your existing datasets, in the formats you already publish.' },
      { lead: 'No exclusivity', rest: 'your own tools carry on, this one is added.' },
      { lead: 'No disruption', rest: 'your updates are picked up automatically once the connection is made.' },
    ],
    stats: [
      { value: '11', label: 'networks already connected' },
      { value: '3,000+', label: 'stops served' },
      { value: '0', label: 'lines of code to write on your side' },
      { value: '≈ 6', label: 'weeks from first contact to going live' },
    ],
    stepsTitle: 'How it goes',
    stepsLead: 'Most of the time is not technical: it is reading the data, and it happens once.',
    steps: [
      {
        title: 'You show us your data',
        body: 'An open portal address is enough. If it is not published, you send it to us.',
      },
      {
        title: 'We read it',
        body: 'Stop consistency, connections, calendar, and a comparison with the ground on a few runs. We hand back the list of what does not add up.',
      },
      {
        title: 'You approve, we open',
        body: 'Your lines first appear in a trial version only you can see. When it suits you, the network becomes visible.',
      },
    ],
    featuresTitle: 'What your riders gain',
    featuresLead: 'This is not one more app: it is the end of a second app.',
    features: [
      {
        title: 'One single place',
        body: 'A journey starting on your network and ending on another is planned in one go, without switching apps.',
      },
      {
        title: 'Your colours',
        body: 'Your line codes and your brand, so your riders recognise your network.',
      },
      {
        title: 'Your live data',
        body: 'The departures your system publishes, shown as they are, refreshed every fifteen seconds.',
      },
      {
        title: 'Your disruptions',
        body: 'Your service messages, in your words, attached to the lines concerned.',
      },
    ],
    bandTitle: 'Riders do not know your boundaries',
    bandBody:
      'They know they leave home and arrive at work. That there are three transport authorities and two operators in between does not interest them, and asking them to know it in order to pick the right app is the best way to let them take the car.',
    bandAlt: 'An interchange where several networks meet',
    galleryTitle: 'The details that matter',
    gallery: [
      {
        title: 'Your data stays yours',
        body: 'Nothing is copied or redistributed. We query your sources at the moment the rider looks.',
      },
      {
        title: 'An outage is visible',
        body: 'When your feed stops, the app says so on your lines rather than inventing a departure time.',
      },
      {
        title: 'Redesigns get prepared',
        body: 'Warn us before a network switch, and the review happens before, not after.',
      },
    ],
    finalTitle: 'One conversation is enough to know',
    finalBody:
      'Tell us where your data is. Within a week we tell you what would work straight away, and what would take work.',
  },
];

export const SOLUTIONS: Record<Lang, SolutionCopy[]> = { fr: FR, en: EN };

/** Une solution par son segment d'adresse, ou rien si le segment est inventé. */
export function findSolution(lang: Lang, slug: string | undefined): SolutionCopy | undefined {
  if (!slug) return undefined;
  return SOLUTIONS[lang].find(item => item.slug === slug);
}
