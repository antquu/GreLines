export interface TermsSection {
  title: string;
  paragraphs: string[];
}

export function getOuraTerms(language: 'fr' | 'en'): {
  title: string;
  intro: string;
  sections: TermsSection[];
  checkbox: string;
  accept: string;
  version: string;
} {
  if (language === 'en') {
    return {
      title: 'Before adding your card',
      intro: 'Please read these terms carefully. You accept them once, for this card.',
      sections: [
        {
          title: 'GreLines is not the transport network',
          paragraphs: [
            'GreLines is an independent project. It is not published, approved or operated by M réso, SMMAG, Mobilités M, the OURA scheme or the Auvergne-Rhône-Alpes Region.',
            'The card details shown in the app (contract, validity) come from public services of the network. They may be wrong, late or unavailable.',
          ],
        },
        {
          title: 'The card in the app is not a ticket',
          paragraphs: [
            'What GreLines shows is a reminder of your card, for your own convenience. It is not a transport ticket and does not replace your physical OURA card.',
            'During an inspection, only your physical card and the tickets loaded on it count. Showing the app instead does not exempt you from a fine.',
          ],
        },
        {
          title: 'Only your own card',
          paragraphs: [
            'You certify that you are the holder of this card, or the legal guardian of its holder if they are a minor.',
            'Adding someone else’s card without their agreement, using a card that is not yours, or passing off the app as a ticket is forbidden and may constitute fraud. You alone are responsible for it.',
          ],
        },
        {
          title: 'Your data',
          paragraphs: [
            'To display the card, GreLines stores the card number, the first and last name you enter and your photo on its servers, linked to a random device identifier, not to an account.',
            'They are used only to show your card in the app. They are never sold or shared with advertisers.',
            'You can remove the card from the app at any time, and ask for your data to be deleted by writing to the contact address listed in the app.',
          ],
        },
        {
          title: 'We may stop',
          paragraphs: [
            'GreLines may suspend or remove a card that seems to be misused, or end this feature at any time, for example at the network’s request.',
          ],
        },
      ],
      checkbox: 'I have read and accept these terms, and I certify that this card is mine (or that of a minor in my care).',
      accept: 'Accept and continue',
      version: 'Version of 2 October 2026',
    };
  }

  return {
    title: 'Avant d’ajouter votre carte',
    intro: 'Lisez ces conditions avec attention. Vous les acceptez une fois, pour cette carte.',
    sections: [
      {
        title: 'GreLines n’est pas le réseau de transport',
        paragraphs: [
          'GreLines est un projet indépendant. Il n’est ni édité, ni approuvé, ni exploité par M réso, le SMMAG, Mobilités M, le dispositif OURA ou la Région Auvergne-Rhône-Alpes.',
          'Les informations de la carte affichées dans l’application (abonnement, validité) viennent des services publics du réseau. Elles peuvent être fausses, en retard ou indisponibles.',
        ],
      },
      {
        title: 'La carte dans l’application n’est pas un titre de transport',
        paragraphs: [
          'Ce que GreLines affiche est un rappel de votre carte, pour votre confort. Ce n’est pas un titre de transport et cela ne remplace pas votre carte OURA physique.',
          'Lors d’un contrôle, seuls votre carte physique et les titres chargés dessus font foi. Présenter l’application à la place ne vous dispense pas d’une amende.',
        ],
      },
      {
        title: 'Seulement votre propre carte',
        paragraphs: [
          'Vous certifiez être le porteur de cette carte, ou le représentant légal de son porteur s’il est mineur.',
          'Ajouter la carte de quelqu’un d’autre sans son accord, utiliser une carte qui n’est pas la vôtre, ou faire passer l’application pour un titre de transport est interdit et peut constituer une fraude. Vous en êtes seul responsable.',
        ],
      },
      {
        title: 'Vos données',
        paragraphs: [
          'Pour afficher la carte, GreLines conserve sur ses serveurs le numéro de la carte, le prénom et le nom que vous saisissez et votre photo, rattachés à un identifiant d’appareil tiré au sort, pas à un compte.',
          'Ils servent uniquement à montrer votre carte dans l’application. Ils ne sont jamais vendus ni transmis à des annonceurs.',
          'Vous pouvez retirer la carte de l’application à tout moment, et demander l’effacement de vos données en écrivant à l’adresse de contact indiquée dans l’application.',
        ],
      },
      {
        title: 'Nous pouvons arrêter',
        paragraphs: [
          'GreLines peut suspendre ou retirer une carte dont l’usage paraît détourné, ou arrêter cette fonction à tout moment, par exemple à la demande du réseau.',
        ],
      },
    ],
    checkbox: 'J’ai lu et j’accepte ces conditions, et je certifie que cette carte est la mienne (ou celle d’un mineur dont j’ai la charge).',
    accept: 'Accepter et continuer',
    version: 'Version du 2 octobre 2026',
  };
}
