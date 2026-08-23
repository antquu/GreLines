/**
 * Les pages légales de GreLines.
 *
 * Elles vivent à part du reste de la page d'accueil : ce ne sont pas des
 * arguments, ce sont des engagements, et on les relit sans toucher au discours
 * commercial.
 *
 * Les adresses sont en anglais dans les deux langues — `/fr/legals/privacy-policy`
 * comme `/en/legals/privacy-policy`. Un lien vers une politique de
 * confidentialité se colle dans un courriel, dans un ticket, dans un formulaire
 * de magasin d'applications, et il vaut mieux qu'il désigne le même document
 * quelle que soit la langue de celui qui l'a copié. Seul le contenu change.
 *
 * Ce texte décrit ce que l'application fait réellement, et rien de plus. Il n'a
 * pas été relu par un juriste : c'est une base honnête, pas un avis juridique.
 */

export type LegalSlug = 'privacy-policy' | 'terms-of-service' | 'terms-of-sale' | 'gdpr';

export interface LegalSection {
  /** L'ancre, en anglais elle aussi, pour que les liens profonds survivent. */
  id: string;
  heading: string;
  /** Un paragraphe par entrée. Une entrée qui commence par « - » fait une liste. */
  body: string[];
}

export interface LegalDocument {
  slug: LegalSlug;
  title: string;
  /** Sous le titre : à quoi sert ce document, en une phrase. */
  lede: string;
  updated: string;
  sections: LegalSection[];
}

/** L'ordre dans lequel les documents se suivent, en pied de page comme ailleurs. */
export const LEGAL_ORDER: LegalSlug[] = [
  'privacy-policy',
  'gdpr',
  'terms-of-service',
  'terms-of-sale',
];

const UPDATED_FR = '23 août 2026';
const UPDATED_EN = '23 August 2026';

const FR: Record<LegalSlug, LegalDocument> = {
  'privacy-policy': {
    slug: 'privacy-policy',
    title: 'Politique de confidentialité',
    lede:
      "Ce que GreLines conserve, pourquoi, combien de temps, et comment vous pouvez le faire effacer.",
    updated: UPDATED_FR,
    sections: [
      {
        id: 'principle',
        heading: 'Le principe',
        body: [
          "GreLines s'utilise sans compte. Chercher un arrêt, lire les prochains passages, calculer un itinéraire, afficher un écran d'information : rien de tout cela ne demande d'identité, et rien de tout cela n'est rattaché à une personne.",
          "Un compte n'existe que si vous en créez un, et il ne sert qu'à une chose : rattacher une carte OùRA à un pseudonyme et à une photo, pour que les personnes que vous aidez sachent à qui elles ont affaire.",
        ],
      },
      {
        id: 'data',
        heading: 'Ce qui est conservé',
        body: [
          "Sur votre appareil seulement, et jamais transmis : vos favoris, vos trajets enregistrés, vos réglages d'affichage, la langue, le thème, les réseaux que vous avez choisi d'afficher, et les arrêts récemment consultés. Effacer les données du site depuis les réglages les supprime définitivement.",
          "Sur nos serveurs, uniquement si vous créez un compte : le numéro de votre carte OùRA, votre prénom et votre nom, votre date de naissance telle que le réseau nous la transmet, la photo prise lors de la vérification, votre pseudonyme, et le décompte des personnes que vous avez aidées.",
          "Aucune donnée de localisation n'est envoyée. La position sert à centrer la carte et à calculer un itinéraire, sur votre appareil ; elle ne quitte pas le navigateur.",
        ],
      },
      {
        id: 'why',
        heading: 'Pourquoi',
        body: [
          "La photo et le nom servent à vérifier qu'une carte OùRA est bien la vôtre. Sans cette vérification, n'importe qui pourrait rattacher n'importe quelle carte à son compte.",
          "Le pseudonyme et la photo apparaissent auprès des personnes que vous aidez, et nulle part ailleurs. Ils ne sont pas publiés, pas indexés, pas vendus.",
        ],
      },
      {
        id: 'third-parties',
        heading: 'Ce qui sort de chez nous',
        body: [
          "Les horaires, les tracés et l'infotrafic viennent des services de données ouvertes des réseaux et de leurs exploitants. Les interroger revient à leur transmettre l'arrêt ou l'itinéraire demandé, sans rien qui vous désigne.",
          "Le fond de carte est servi par notre fournisseur cartographique. L'hébergement et les mesures d'audience sont assurés par Vercel : ces mesures sont agrégées, sans identifiant publicitaire ni traceur inter-sites.",
          "Les comptes et les cartes sont stockés chez Supabase, en Europe.",
          "Aucune publicité, aucun revendeur de données, aucun pistage entre sites. Il n'y a rien à refuser dans une bannière, parce qu'il n'y a rien à accepter.",
        ],
      },
      {
        id: 'retention',
        heading: 'Combien de temps',
        body: [
          "Les données d'un compte sont conservées tant que le compte existe. Une demande de suppression les efface sous quelques minutes, définitivement et sans copie de sauvegarde conservée au-delà de trente jours.",
          "Les données stockées sur votre appareil restent chez vous aussi longtemps que vous les gardez.",
        ],
      },
      {
        id: 'rights',
        heading: 'Vos droits',
        body: [
          "Vous pouvez consulter ce qui est conservé sur vous, et en demander la suppression, sur data.grelines.fr. Les deux démarches se font depuis le site, sans nous écrire et sans justificatif autre que la carte elle-même.",
          "Le détail de ces droits et la façon de les exercer figurent dans la page consacrée au RGPD.",
        ],
      },
      {
        id: 'contact',
        heading: 'Nous joindre',
        body: [
          "Pour toute question sur cette politique : ant.adam468@gmail.com.",
        ],
      },
    ],
  },

  gdpr: {
    slug: 'gdpr',
    title: 'RGPD',
    lede:
      "Vos droits sur vos données, ce que nous faisons pour les respecter, et comment les exercer.",
    updated: UPDATED_FR,
    sections: [
      {
        id: 'controller',
        heading: 'Responsable du traitement',
        body: [
          "GreLines est un projet indépendant, sans lien de subordination avec les réseaux dont il affiche les données. Le responsable du traitement peut être joint à ant.adam468@gmail.com.",
        ],
      },
      {
        id: 'legal-basis',
        heading: 'Bases légales',
        body: [
          "Le consentement, pour la création d'un compte et la vérification d'identité par photo : vous les déclenchez, et rien ne se produit sans votre geste.",
          "L'intérêt légitime, pour la mesure d'audience agrégée qui nous dit combien de personnes utilisent l'application, sans dire lesquelles.",
          "L'exécution du service, pour l'interrogation des données de transport nécessaires à l'affichage que vous demandez.",
        ],
      },
      {
        id: 'your-rights',
        heading: 'Ce que vous pouvez exiger',
        body: [
          "- Accès : savoir ce qui est conservé sur vous, et en obtenir une copie.",
          "- Rectification : corriger un nom, un prénom ou une date de naissance inexacts.",
          "- Effacement : faire supprimer votre compte et tout ce qui s'y rattache.",
          "- Opposition et limitation : demander l'arrêt d'un traitement, ou son gel le temps d'une contestation.",
          "- Portabilité : recevoir vos données dans un format lisible par une machine.",
        ],
      },
      {
        id: 'how',
        heading: 'Comment les exercer',
        body: [
          "L'accès et l'effacement se font directement sur data.grelines.fr, sans intermédiaire et sans délai d'instruction : le formulaire vous rend ce qui est conservé, et la demande de suppression est exécutée en quelques minutes.",
          "Les autres droits s'exercent par courriel à ant.adam468@gmail.com. Nous répondons sous un mois, comme la réglementation l'impose.",
        ],
      },
      {
        id: 'complaint',
        heading: 'Réclamation',
        body: [
          "Si notre réponse ne vous satisfait pas, vous pouvez saisir la CNIL, autorité de contrôle française, à l'adresse cnil.fr.",
        ],
      },
      {
        id: 'transfers',
        heading: "Transferts hors de l'Union",
        body: [
          "Les comptes et les cartes sont hébergés dans l'Union européenne. L'hébergement du site et la mesure d'audience peuvent impliquer des traitements par un prestataire soumis aux clauses contractuelles types de la Commission européenne.",
        ],
      },
    ],
  },

  'terms-of-service': {
    slug: 'terms-of-service',
    title: "Conditions générales d'utilisation",
    lede: "Ce que GreLines vous propose, et ce qu'on attend en retour.",
    updated: UPDATED_FR,
    sections: [
      {
        id: 'scope',
        heading: 'Objet',
        body: [
          "Ces conditions régissent l'usage de l'application GreLines, de ses écrans d'information et des sites qui l'accompagnent. Utiliser le service vaut acceptation.",
        ],
      },
      {
        id: 'service',
        heading: 'Le service',
        body: [
          "GreLines affiche les horaires, les itinéraires et l'infotrafic des réseaux de Grenoble et de sa région, à partir des données que ces réseaux publient. Le service est gratuit, sans publicité, et ne requiert pas de compte.",
          "GreLines n'est pas l'exploitant de ces réseaux et ne vend pas de titres de transport. Les liens d'achat mènent aux boutiques officielles.",
        ],
      },
      {
        id: 'accuracy',
        heading: "Exactitude de l'information",
        body: [
          "Les horaires affichés sont ceux que les réseaux publient, en temps réel quand ils le publient, théoriques sinon. Un véhicule peut être supprimé, dérouté ou en avance sans que l'information nous parvienne.",
          "GreLines ne garantit donc ni l'exactitude ni la disponibilité continue des informations, et ne saurait être tenu responsable d'un trajet manqué. En cas de doute, l'information de l'exploitant fait foi.",
        ],
      },
      {
        id: 'accounts',
        heading: 'Comptes',
        body: [
          "Un compte est rattaché à une carte OùRA dont vous devez être le titulaire. Rattacher une carte qui ne vous appartient pas, ou fournir une photo qui n'est pas la vôtre, entraîne la suppression du compte.",
          "Vous êtes responsable de ce que vous publiez sous votre pseudonyme, y compris des signalements d'affluence et des avis.",
        ],
      },
      {
        id: 'acceptable-use',
        heading: 'Usage acceptable',
        body: [
          "- Ne pas tenter d'entraver le service, ni de le solliciter à une cadence qui le dégrade pour les autres.",
          "- Ne pas extraire massivement les données pour les republier en se faisant passer pour leur source.",
          "- Ne pas publier de contenu illicite, haineux ou trompeur.",
        ],
      },
      {
        id: 'availability',
        heading: 'Disponibilité',
        body: [
          "Le service peut être interrompu pour maintenance, ou par la défaillance d'un fournisseur de données. L'état du service est publié sur status.grelines.fr.",
        ],
      },
      {
        id: 'changes',
        heading: 'Évolutions',
        body: [
          "Ces conditions peuvent changer. La date de dernière mise à jour figure en tête de page, et les changements substantiels sont annoncés dans l'application.",
        ],
      },
    ],
  },

  'terms-of-sale': {
    slug: 'terms-of-sale',
    title: 'Conditions générales de vente',
    lede:
      "Elles ne concernent que les offres destinées aux réseaux de transport. L'application reste gratuite.",
    updated: UPDATED_FR,
    sections: [
      {
        id: 'scope',
        heading: "Champ d'application",
        body: [
          "Ces conditions régissent les prestations que GreLines fournit à des personnes morales : intégration d'un réseau, écrans d'information, campagnes d'affichage, messages aux porteurs de carte, et accompagnement associé.",
          "Elles ne s'appliquent pas à l'application grand public, qui est gratuite et le restera.",
        ],
      },
      {
        id: 'orders',
        heading: 'Commande',
        body: [
          "Toute prestation fait l'objet d'un devis écrit précisant son périmètre, son prix et sa durée. La commande est formée par l'acceptation écrite du devis.",
        ],
      },
      {
        id: 'price',
        heading: 'Prix et paiement',
        body: [
          "Les prix sont exprimés en euros hors taxes. Sauf mention contraire au devis, le règlement intervient à trente jours à compter de la facture.",
          "Tout retard de paiement entraîne de plein droit des pénalités au taux d'intérêt légal majoré, et l'indemnité forfaitaire de recouvrement prévue par la loi.",
        ],
      },
      {
        id: 'delivery',
        heading: 'Exécution',
        body: [
          "Les délais annoncés sont donnés à titre indicatif et courent à compter de la réception des éléments nécessaires — accès aux données, contenus, validations.",
        ],
      },
      {
        id: 'withdrawal',
        heading: 'Rétractation',
        body: [
          "Les prestations étant destinées à des professionnels dans le cadre de leur activité, le droit de rétractation prévu pour les consommateurs ne s'applique pas.",
        ],
      },
      {
        id: 'liability',
        heading: 'Responsabilité',
        body: [
          "La responsabilité de GreLines au titre d'une prestation est limitée au montant effectivement payé pour celle-ci. Les dommages indirects, notamment la perte d'exploitation, ne donnent pas lieu à réparation.",
        ],
      },
      {
        id: 'law',
        heading: 'Droit applicable',
        body: [
          "Ces conditions sont soumises au droit français. À défaut d'accord amiable, le litige relève des tribunaux compétents de Grenoble.",
        ],
      },
    ],
  },
};

const EN: Record<LegalSlug, LegalDocument> = {
  'privacy-policy': {
    slug: 'privacy-policy',
    title: 'Privacy policy',
    lede: 'What GreLines keeps, why, for how long, and how to have it erased.',
    updated: UPDATED_EN,
    sections: [
      {
        id: 'principle',
        heading: 'The principle',
        body: [
          'GreLines works without an account. Finding a stop, reading departures, planning a journey, running an information screen: none of it asks who you are, and none of it is tied to a person.',
          'An account exists only if you create one, and it does one thing: it links an OùRA card to a nickname and a photo, so the people you help know who they are dealing with.',
        ],
      },
      {
        id: 'data',
        heading: 'What is kept',
        body: [
          'On your device only, never transmitted: your favourites, saved journeys, display settings, language, theme, the networks you chose to show, and recently opened stops. Clearing site data from the settings deletes them for good.',
          'On our servers, only if you create an account: your OùRA card number, your first and last name, the date of birth the network sends us, the photo taken during verification, your nickname, and the count of people you have helped.',
          'No location data is sent. Your position centres the map and plans a journey on your device; it does not leave the browser.',
        ],
      },
      {
        id: 'why',
        heading: 'Why',
        body: [
          'The photo and name verify that an OùRA card is yours. Without that check, anyone could attach any card to their account.',
          'Your nickname and photo appear to the people you help, and nowhere else. They are not published, not indexed, not sold.',
        ],
      },
      {
        id: 'third-parties',
        heading: 'What leaves our systems',
        body: [
          'Timetables, route shapes and disruption notices come from the open data services of the networks and their operators. Querying them means telling them which stop or journey was asked for, and nothing that identifies you.',
          'The base map is served by our mapping provider. Hosting and audience measurement are handled by Vercel: those measurements are aggregated, with no advertising identifier and no cross-site tracker.',
          'Accounts and cards are stored with Supabase, in Europe.',
          'No advertising, no data brokers, no cross-site tracking. There is nothing to decline in a banner because there is nothing to accept.',
        ],
      },
      {
        id: 'retention',
        heading: 'For how long',
        body: [
          'Account data is kept as long as the account exists. A deletion request erases it within minutes, permanently, with no backup retained beyond thirty days.',
          'Data stored on your device stays with you for as long as you keep it.',
        ],
      },
      {
        id: 'rights',
        heading: 'Your rights',
        body: [
          'You can see what is held about you, and ask for it to be deleted, at data.grelines.fr. Both are done from the site, without writing to us and without proof beyond the card itself.',
          'The detail of those rights and how to use them is on the GDPR page.',
        ],
      },
      {
        id: 'contact',
        heading: 'Contact',
        body: ['Any question about this policy: ant.adam468@gmail.com.'],
      },
    ],
  },

  gdpr: {
    slug: 'gdpr',
    title: 'GDPR',
    lede: 'Your rights over your data, what we do to honour them, and how to use them.',
    updated: UPDATED_EN,
    sections: [
      {
        id: 'controller',
        heading: 'Data controller',
        body: [
          'GreLines is an independent project, not affiliated with the networks whose data it displays. The controller can be reached at ant.adam468@gmail.com.',
        ],
      },
      {
        id: 'legal-basis',
        heading: 'Legal bases',
        body: [
          'Consent, for creating an account and verifying identity by photo: you start both, and nothing happens without your action.',
          'Legitimate interest, for aggregated audience measurement that tells us how many people use the app, without telling us which.',
          'Performance of the service, for querying the transit data needed to show what you asked for.',
        ],
      },
      {
        id: 'your-rights',
        heading: 'What you can require',
        body: [
          '- Access: know what is held about you, and get a copy.',
          '- Rectification: correct an inaccurate name or date of birth.',
          '- Erasure: have your account and everything attached to it deleted.',
          '- Objection and restriction: ask for processing to stop, or to be frozen during a dispute.',
          '- Portability: receive your data in a machine-readable format.',
        ],
      },
      {
        id: 'how',
        heading: 'How to use them',
        body: [
          'Access and erasure happen directly at data.grelines.fr, with no intermediary and no waiting period: the form returns what is held, and a deletion request is carried out within minutes.',
          'Other rights are exercised by email at ant.adam468@gmail.com. We answer within one month, as the regulation requires.',
        ],
      },
      {
        id: 'complaint',
        heading: 'Complaints',
        body: [
          'If our answer does not satisfy you, you may refer the matter to the CNIL, the French supervisory authority, at cnil.fr.',
        ],
      },
      {
        id: 'transfers',
        heading: 'Transfers outside the Union',
        body: [
          'Accounts and cards are hosted in the European Union. Site hosting and audience measurement may involve a provider bound by the European Commission standard contractual clauses.',
        ],
      },
    ],
  },

  'terms-of-service': {
    slug: 'terms-of-service',
    title: 'Terms of service',
    lede: 'What GreLines offers you, and what is expected in return.',
    updated: UPDATED_EN,
    sections: [
      {
        id: 'scope',
        heading: 'Purpose',
        body: [
          'These terms govern the use of the GreLines app, its information screens and the sites around it. Using the service means accepting them.',
        ],
      },
      {
        id: 'service',
        heading: 'The service',
        body: [
          'GreLines shows timetables, journeys and disruption notices for the networks of Grenoble and its region, from the data those networks publish. The service is free, carries no advertising, and needs no account.',
          'GreLines does not operate those networks and does not sell tickets. Purchase links lead to the official shops.',
        ],
      },
      {
        id: 'accuracy',
        heading: 'Accuracy',
        body: [
          'Displayed times are the ones the networks publish, live when they publish live data, scheduled otherwise. A vehicle can be cancelled, diverted or early without the information reaching us.',
          'GreLines therefore guarantees neither the accuracy nor the continuous availability of the information, and cannot be held responsible for a missed journey. When in doubt, the operator information prevails.',
        ],
      },
      {
        id: 'accounts',
        heading: 'Accounts',
        body: [
          'An account is linked to an OùRA card you must hold. Linking a card that is not yours, or supplying a photo that is not you, leads to the account being deleted.',
          'You are responsible for what you publish under your nickname, including crowding reports and reviews.',
        ],
      },
      {
        id: 'acceptable-use',
        heading: 'Acceptable use',
        body: [
          '- Do not try to disrupt the service, or call it at a rate that degrades it for others.',
          '- Do not bulk-extract the data to republish it as if you were its source.',
          '- Do not publish unlawful, hateful or misleading content.',
        ],
      },
      {
        id: 'availability',
        heading: 'Availability',
        body: [
          'The service may be interrupted for maintenance, or by a data provider failing. Service status is published at status.grelines.fr.',
        ],
      },
      {
        id: 'changes',
        heading: 'Changes',
        body: [
          'These terms may change. The last update date is at the top of the page, and substantial changes are announced in the app.',
        ],
      },
    ],
  },

  'terms-of-sale': {
    slug: 'terms-of-sale',
    title: 'Terms of sale',
    lede: 'These cover the offers aimed at transit networks only. The app stays free.',
    updated: UPDATED_EN,
    sections: [
      {
        id: 'scope',
        heading: 'Scope',
        body: [
          'These terms govern the services GreLines provides to organisations: adding a network, information screens, poster campaigns, messages to card holders, and the support that goes with them.',
          'They do not apply to the consumer app, which is free and will stay that way.',
        ],
      },
      {
        id: 'orders',
        heading: 'Orders',
        body: [
          'Every engagement is quoted in writing, stating its scope, price and duration. The order is formed by written acceptance of the quote.',
        ],
      },
      {
        id: 'price',
        heading: 'Price and payment',
        body: [
          'Prices are in euros, excluding tax. Unless the quote says otherwise, payment is due thirty days from the invoice.',
          'Late payment automatically triggers interest at the statutory rate plus the legal margin, and the fixed recovery indemnity provided by law.',
        ],
      },
      {
        id: 'delivery',
        heading: 'Delivery',
        body: [
          'Announced timescales are indicative and start when the necessary items are received: data access, content, approvals.',
        ],
      },
      {
        id: 'withdrawal',
        heading: 'Withdrawal',
        body: [
          'As the services are intended for professionals acting in the course of their business, the consumer right of withdrawal does not apply.',
        ],
      },
      {
        id: 'liability',
        heading: 'Liability',
        body: [
          'GreLines liability for an engagement is limited to the amount actually paid for it. Indirect damages, in particular loss of business, are not compensated.',
        ],
      },
      {
        id: 'law',
        heading: 'Governing law',
        body: [
          'These terms are governed by French law. Failing an amicable settlement, disputes fall to the competent courts of Grenoble.',
        ],
      },
    ],
  },
};

export const LEGAL: Record<'fr' | 'en', Record<LegalSlug, LegalDocument>> = { fr: FR, en: EN };

/** Vrai si l'adresse désigne un document que nous publions. */
export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_ORDER as string[]).includes(value);
}
