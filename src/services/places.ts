/**
 * Les lieux à visiter, et ce qu'on en dit.
 *
 * Séparés du carrousel qui les montre : ce sont des données, elles changeront
 * pour d'autres raisons et à d'autres moments que la mise en page. Les garder
 * dans le même fichier privait aussi le composant du rechargement à chaud, qui
 * ne fonctionne que pour un fichier n'exportant que des composants.
 *
 * Les noms de lignes s'écrivent entre doubles crochets, `[[A]]`, `[[C1]]`. Le
 * carrousel les remplace par la pastille de la ligne, avec sa couleur : c'est
 * ainsi qu'on la cherche sur un plan et sur un quai, pas sous forme de lettre
 * au milieu d'une phrase.
 */

export interface PlaceSection {
  heading?: string;
  body: string[];
}

export interface PlaceCredit {
  author: string;
  license: string;
  licenseUrl: string;
}

export interface Place {
  id: string;
  /** L'image, en pleine définition : elle occupe l'écran entier une fois ouverte. */
  image: string;
  /** Ce qui s'écrit sous la vignette, sur deux lignes au plus. */
  card: string;
  /** Le titre de l'en-tête, posé sur la photographie. */
  title: string;
  /** La ligne d'appoint de l'en-tête : horaires, saison, quartier. */
  kicker: string;
  /** Le grand titre, sous la photographie. */
  headline: string;
  /** La phrase qui donne envie d'y aller. */
  tagline: string;
  sections: PlaceSection[];
  /**
   * Où c'est, pour le bouton « Y aller ».
   *
   * Le point visé est le lieu lui-même et non son arrêt : le calculateur sait
   * finir à pied, et viser l'arrêt aurait décidé à la place du voyageur par
   * quelle ligne il y va.
   */
  lat: number;
  lon: number;
  /**
   * Qui a pris la photographie, et sous quelle licence.
   *
   * Les trois images viennent de Wikimedia Commons, sous licence Creative
   * Commons : elles s'utilisent librement, à condition de nommer l'auteur et
   * de dire la licence. La mention se pose donc en bas de la feuille, après ce
   * qu'on est venu lire, mais dans la même feuille, pas ailleurs.
   */
  credit: PlaceCredit;
}

/**
 * Trois lieux, et pas plus.
 *
 * Ce n'est pas un office de tourisme : c'est ce qu'on montre à quelqu'un qui
 * descend du train et demande quoi voir. La Bastille pour la vue, le musée
 * pour la pluie, le parc et sa tour pour la ville d'en bas, et chacun se
 * rejoint par le réseau, ce qui est le sujet de l'application.
 */
export function grenoblePlaces(language: 'fr' | 'en'): Place[] {
  const fr = language === 'fr';
  return [
    {
      id: 'bastille',
      image: '/assets/places/telepherique.jpg',
      card: fr ? 'La Bastille' : 'The Bastille',
      title: fr ? 'La Bastille' : 'The Bastille',
      kicker: fr ? 'Ouvert toute l’année' : 'Open all year',
      headline: fr ? 'La Bastille et ses Bulles' : 'The Bastille and its Bubbles',
      tagline: fr
        ? 'Montez au-dessus de la ville en quatre minutes'
        : 'Rise above the city in four minutes',
      lat: 45.1985,
      lon: 5.7245,
      sections: [
        {
          heading: fr
            ? 'Le premier téléphérique urbain du monde'
            : 'The world’s first urban cable car',
          body: fr
            ? [
                'Les Bulles relient le quai Stéphane-Jay au fort de la Bastille depuis 1934. Les sphères de verre que l’on connaît datent de 1976 : cinq cabines rondes qui franchissent l’Isère puis la falaise en une poignée de minutes.',
                'En haut, à 476 mètres, la vue porte sur les trois massifs qui enserrent Grenoble, le Vercors, la Chartreuse et Belledonne, et sur la ville posée à plat entre eux. Les terrasses, les casemates et les galeries du fort se parcourent librement.',
              ]
            : [
                'The Bubbles have linked Quai Stéphane-Jay to the Bastille fort since 1934. The glass spheres everyone knows date from 1976: five round cabins crossing the Isère and then the cliff in a handful of minutes.',
                'At the top, 476 metres up, the view takes in the three ranges that hem Grenoble in, the Vercors, the Chartreuse and Belledonne, and the city lying flat between them. The fort’s terraces, casemates and galleries are open to walk.',
              ],
        },
        {
          heading: fr ? 'Y aller' : 'Getting there',
          body: fr
            ? [
                'Tram [[A]] ou [[B]], arrêt Maison du Tourisme, puis cinq minutes à pied par la passerelle Saint-Laurent. Les lignes [[C1]] et [[16]] desservent également le quai.',
                'À pied, le sentier Tom Morel monte depuis le jardin des Dauphins : comptez quarante-cinq minutes et de bonnes chaussures.',
              ]
            : [
                'Tram [[A]] or [[B]] to Maison du Tourisme, then a five-minute walk across the Saint-Laurent footbridge. Lines [[C1]] and [[16]] also serve the quay.',
                'On foot, the Tom Morel path climbs from the Jardin des Dauphins: allow forty-five minutes and proper shoes.',
              ],
        },
      ],
      credit: {
        author: 'Calips',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      },
    },
    {
      id: 'musee',
      image: '/assets/places/museaum.jpg',
      card: fr ? 'Musée de Grenoble' : 'Grenoble Museum',
      title: fr ? 'Musée de Grenoble' : 'Grenoble Museum',
      kicker: fr ? 'Tous les jours sauf le mardi' : 'Daily except Tuesday',
      headline: fr ? 'Le musée de Grenoble' : 'The Grenoble Museum',
      tagline: fr
        ? 'Sept siècles de peinture, à deux pas de l’Isère'
        : 'Seven centuries of painting, a step from the Isère',
      lat: 45.1949,
      lon: 5.7326,
      sections: [
        {
          heading: fr ? 'Une collection qui compte' : 'A collection that counts',
          body: fr
            ? [
                'Ouvert dès 1798, le musée de Grenoble fut l’un des premiers en France à faire entrer l’art moderne dans ses salles. On y suit la peinture européenne de Véronèse à Rubens, puis Matisse, Picasso, Chagall et Soulages, dans un bâtiment de 1994 traversé de lumière.',
                'Le jardin de sculptures, sur l’esplanade, se visite sans billet. Les œuvres y voisinent avec la tour de l’Isle, vestige des remparts de la ville.',
              ]
            : [
                'Opened in 1798, the Grenoble museum was among the first in France to bring modern art into its rooms. European painting runs from Veronese and Rubens to Matisse, Picasso, Chagall and Soulages, inside a light-filled 1994 building.',
                'The sculpture garden on the esplanade needs no ticket. The works stand beside the Tour de l’Isle, a remnant of the city walls.',
              ],
        },
        {
          heading: fr ? 'Y aller' : 'Getting there',
          body: fr
            ? [
                'Tram [[B]], arrêt Notre-Dame / Musée : l’entrée est à cinquante mètres. Le tram [[A]] s’arrête à Sainte-Claire / Les Halles, cinq minutes à pied par la vieille ville.',
              ]
            : [
                'Tram [[B]] to Notre-Dame / Musée: the entrance is fifty metres away. Tram [[A]] stops at Sainte-Claire / Les Halles, a five-minute walk through the old town.',
              ],
        },
      ],
      credit: {
        author: 'Milky',
        license: 'CC BY-SA 3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      },
    },
    {
      id: 'tour-perret',
      image: '/assets/places/tour-perret.jpg',
      card: fr ? 'Parc Paul Mistral' : 'Parc Paul Mistral',
      title: fr ? 'Parc Paul Mistral' : 'Parc Paul Mistral',
      kicker: fr ? 'Parc ouvert en continu' : 'Park open all day',
      headline: fr ? 'Le parc et la tour Perret' : 'The park and the Perret tower',
      tagline: fr
        ? 'Vingt hectares de verdure et la première tour de béton d’Europe'
        : 'Twenty hectares of green and Europe’s first concrete tower',
      lat: 45.1852,
      lon: 5.733,
      sections: [
        {
          heading: fr ? 'Un vestige de 1925' : 'A relic of 1925',
          body: fr
            ? [
                'La tour Perret fut bâtie pour l’Exposition internationale de la houille blanche : quatre-vingt-quinze mètres de béton armé, une prouesse pour l’époque et la plus haute tour d’Europe dans ce matériau. Elle veille depuis sur le parc, reconnaissable de toute la ville.',
                'Autour d’elle, le parc Paul Mistral déroule ses pelouses et ses allées, entre le stade des Alpes et l’hôtel de ville.',
              ]
            : [
                'The Perret tower was built for the 1925 International Exhibition of Hydropower: ninety-five metres of reinforced concrete, a feat for its day and Europe’s tallest tower in the material. It has watched over the park ever since, recognisable from anywhere in the city.',
                'Around it, Parc Paul Mistral unrolls lawns and avenues between the Stade des Alpes and the city hall.',
              ],
        },
        {
          heading: fr ? 'Y aller' : 'Getting there',
          body: fr
            ? [
                'Tram [[A]], arrêt Chavant, ou tram [[C]], arrêt Parc Paul Mistral : les deux bordent le parc. Le stade des Alpes est desservi par la ligne [[C]] les soirs de match.',
              ]
            : [
                'Tram [[A]] to Chavant, or tram [[C]] to Parc Paul Mistral: both run along the park. Line [[C]] serves the Stade des Alpes on match nights.',
              ],
        },
      ],
      credit: {
        author: 'Morburre',
        license: 'CC BY-SA 3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      },
    },
  ];
}
