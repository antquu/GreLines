import { IS_NANCY } from '../site';

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
  image: string;
  card: string;
  title: string;
  kicker: string;
  headline: string;
  tagline: string;
  sections: PlaceSection[];
  lat: number;
  lon: number;
  credit: PlaceCredit;
}

function grenoblePlaces(language: 'fr' | 'en'): Place[] {
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

const NANCY_PLACE_LINES: Record<string, { id: string; color: string; textColor: string }> = {
  T1: { id: 'STAN:1', color: '#E30613', textColor: '#FFFFFF' },
  T3: { id: 'STAN:3', color: '#009639', textColor: '#FFFFFF' },
  T4: { id: 'STAN:4', color: '#FFDD04', textColor: '#000000' },
  T5: { id: 'STAN:5', color: '#4B2884', textColor: '#FFFFFF' },
  Cit1: { id: 'STAN:41', color: '#4AB79B', textColor: '#FFFFFF' },
  11: { id: 'STAN:11', color: '#FF7900', textColor: '#FFFFFF' },
  16: { id: 'STAN:16', color: '#1F94CB', textColor: '#FFFFFF' },
};

function nancyPlaces(language: 'fr' | 'en'): Place[] {
  const fr = language === 'fr';
  return [
    {
      id: 'stanislas',
      image: '/assets/places/stanislas.jpg',
      card: fr ? 'Place Stanislas' : 'Place Stanislas',
      title: fr ? 'Place Stanislas' : 'Place Stanislas',
      kicker: fr ? 'Ouverte jour et nuit' : 'Open day and night',
      headline: fr ? 'La place Stanislas' : 'Place Stanislas',
      tagline: fr
        ? 'L’une des plus belles places d’Europe, classée à l’UNESCO'
        : 'One of Europe’s finest squares, a UNESCO World Heritage site',
      lat: 48.69357,
      lon: 6.18323,
      sections: [
        {
          heading: fr ? 'Le cœur de Nancy' : 'The heart of Nancy',
          body: fr
            ? [
                'Aménagée entre 1752 et 1755 pour le roi Stanislas, la place relie la vieille ville et la ville neuve. Ses grilles dorées de Jean Lamour, ses fontaines et ses pavillons forment un ensemble classé au patrimoine mondial de l’UNESCO depuis 1983, avec les places de la Carrière et d’Alliance.',
                'L’hôtel de ville occupe tout le côté sud. Le soir, la place s’illumine, et l’été un spectacle de lumière y est projeté sur les façades.',
              ]
            : [
                'Laid out between 1752 and 1755 for King Stanislas, the square links the old town and the new town. Jean Lamour’s gilded gates, the fountains and the pavilions form an ensemble listed as a UNESCO World Heritage site since 1983, together with Place de la Carrière and Place d’Alliance.',
                'The town hall fills the whole south side. In the evening the square is lit up, and in summer a light show is projected onto the façades.',
              ],
        },
        {
          heading: fr ? 'Y aller' : 'Getting there',
          body: fr
            ? [
                'La navette [[Cit1]] s’arrête Place Stanislas, à deux pas. La ligne [[T1]] dessert l’arrêt Place Stanislas - Cathédrale, à quatre minutes à pied.',
                'Les lignes [[T5]], 12 et 13 s’arrêtent à Amerval, juste derrière l’hôtel de ville.',
              ]
            : [
                'The [[Cit1]] shuttle stops at Place Stanislas, a stone’s throw away. Line [[T1]] serves Place Stanislas - Cathédrale, a four-minute walk.',
                'Lines [[T5]], 12 and 13 stop at Amerval, just behind the town hall.',
              ],
        },
      ],
      credit: {
        author: 'Berthold Werner',
        license: 'CC BY-SA 3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      },
    },
    {
      id: 'pepiniere',
      image: '/assets/places/pepiniere.jpg',
      card: fr ? 'Parc de la Pépinière' : 'Parc de la Pépinière',
      title: fr ? 'Parc de la Pépinière' : 'Parc de la Pépinière',
      kicker: fr ? 'Ouvert tous les jours' : 'Open every day',
      headline: fr ? 'Le parc de la Pépinière' : 'Parc de la Pépinière',
      tagline: fr
        ? 'Vingt et un hectares de verdure en plein centre-ville'
        : 'Twenty-one hectares of green in the city centre',
      lat: 48.69725,
      lon: 6.18505,
      sections: [
        {
          heading: fr ? 'Le jardin des Nancéiens' : 'Nancy’s garden',
          body: fr
            ? [
                'Créé au XVIIIe siècle sur les anciens bastions, le parc de la Pépinière s’étend juste au nord de la place Stanislas. On y trouve une roseraie, un petit zoo, un kiosque à musique, des jeux pour enfants et de longues allées ombragées.',
                'La statue de Claude Gellée, dit le Lorrain, œuvre de Rodin, se dresse à l’entrée côté place de la Carrière.',
              ]
            : [
                'Created in the 18th century on the old ramparts, Parc de la Pépinière lies just north of Place Stanislas. It has a rose garden, a small zoo, a bandstand, playgrounds and long shaded avenues.',
                'Rodin’s statue of Claude Gellée, known as Le Lorrain, stands at the entrance near Place de la Carrière.',
              ],
        },
        {
          heading: fr ? 'Y aller' : 'Getting there',
          body: fr
            ? [
                'La ligne [[16]] s’arrête Parc de la Pépinière. Depuis la place Stanislas, l’entrée est à cinq minutes à pied par la place de la Carrière, où passe la navette [[Cit1]].',
              ]
            : [
                'Line [[16]] stops at Parc de la Pépinière. From Place Stanislas, the entrance is a five-minute walk through Place de la Carrière, served by the [[Cit1]] shuttle.',
              ],
        },
      ],
      credit: {
        author: 'Berthold Werner',
        license: 'CC BY-SA 3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      },
    },
    {
      id: 'majorelle',
      image: '/assets/places/majorelle.jpg',
      card: fr ? 'Villa Majorelle' : 'Villa Majorelle',
      title: fr ? 'Villa Majorelle' : 'Villa Majorelle',
      kicker: fr ? 'Visites selon les horaires du musée' : 'Visits during museum hours',
      headline: fr ? 'La villa Majorelle' : 'Villa Majorelle',
      tagline: fr
        ? 'Le chef-d’œuvre de l’Art nouveau nancéien'
        : 'The masterpiece of Nancy’s Art Nouveau',
      lat: 48.68551,
      lon: 6.16389,
      sections: [
        {
          heading: fr ? 'L’École de Nancy' : 'The École de Nancy',
          body: fr
            ? [
                'Construite en 1901 et 1902 pour l’ébéniste Louis Majorelle, la villa est l’une des premières maisons Art nouveau de Nancy. Ferronneries, vitraux, boiseries et céramiques y ont été pensés ensemble, par les artistes de l’École de Nancy.',
                'À quelques rues, le musée de l’École de Nancy présente meubles, verreries et objets du mouvement, dans un jardin planté de fleurs et d’un aquarium Art nouveau.',
              ]
            : [
                'Built in 1901 and 1902 for the cabinetmaker Louis Majorelle, the villa is one of Nancy’s first Art Nouveau houses. Ironwork, stained glass, woodwork and ceramics were designed together by the artists of the École de Nancy.',
                'A few streets away, the Musée de l’École de Nancy shows furniture, glass and objects from the movement, in a garden with an Art Nouveau aquarium.',
              ],
        },
        {
          heading: fr ? 'Y aller' : 'Getting there',
          body: fr
            ? [
                'La ligne [[T3]] s’arrête à Sacré Coeur, à deux minutes à pied. Les lignes [[T4]], [[11]] et [[16]] desservent Commanderie, à quatre minutes.',
              ]
            : [
                'Line [[T3]] stops at Sacré Coeur, a two-minute walk. Lines [[T4]], [[11]] and [[16]] serve Commanderie, four minutes away.',
              ],
        },
      ],
      credit: {
        author: 'Chabe01',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      },
    },
  ];
}

export const PLACE_LINES: Record<string, { id: string; color: string; textColor: string }> = IS_NANCY ? NANCY_PLACE_LINES : {};

export function cityPlaces(language: 'fr' | 'en'): Place[] {
  return IS_NANCY ? nancyPlaces(language) : grenoblePlaces(language);
}
