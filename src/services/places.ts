import { IS_CITY_SITE, IS_NANCY } from '../site';
import { tx } from '../i18n';

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
      card: tx(fr).places.theBastille,
      title: tx(fr).places.theBastille,
      kicker: tx(fr).places.openAllYear,
      headline: tx(fr).places.theBastilleAndIts,
      tagline: tx(fr).places.riseAboveTheCity,
      lat: 45.1985,
      lon: 5.7245,
      sections: [
        {
          heading: tx(fr).places.theWorldSFirst,
          body: tx(fr).places.theBubblesHaveLinked,
        },
        {
          heading: tx(fr).places.gettingThere,
          body: tx(fr).places.tramAOrB,
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
      card: tx(fr).places.grenobleMuseum,
      title: tx(fr).places.grenobleMuseum,
      kicker: tx(fr).places.dailyExceptTuesday,
      headline: tx(fr).places.theGrenobleMuseum,
      tagline: tx(fr).places.sevenCenturiesOfPainting,
      lat: 45.1949,
      lon: 5.7326,
      sections: [
        {
          heading: tx(fr).places.aCollectionThatCounts,
          body: tx(fr).places.openedIn1798The,
        },
        {
          heading: tx(fr).places.gettingThere,
          body: tx(fr).places.tramBToNotre,
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
      card: tx(fr).places.parcPaulMistral,
      title: tx(fr).places.parcPaulMistral,
      kicker: tx(fr).places.parkOpenAllDay,
      headline: tx(fr).places.theParkAndThe,
      tagline: tx(fr).places.twentyHectaresOfGreen,
      lat: 45.1852,
      lon: 5.733,
      sections: [
        {
          heading: tx(fr).places.aRelicOf1925,
          body: tx(fr).places.thePerretTowerWas,
        },
        {
          heading: tx(fr).places.gettingThere,
          body: tx(fr).places.tramAToChavant,
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
      card: tx(fr).places.placeStanislas,
      title: tx(fr).places.placeStanislas,
      kicker: tx(fr).places.openDayAndNight,
      headline: tx(fr).places.placeStanislas2,
      tagline: tx(fr).places.oneOfEuropeS,
      lat: 48.69357,
      lon: 6.18323,
      sections: [
        {
          heading: tx(fr).places.theHeartOfNancy,
          body: tx(fr).places.laidOutBetween1752,
        },
        {
          heading: tx(fr).places.gettingThere,
          body: tx(fr).places.theCit1ShuttleStops,
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
      card: tx(fr).places.parcDeLaPepiniere,
      title: tx(fr).places.parcDeLaPepiniere,
      kicker: tx(fr).places.openEveryDay,
      headline: tx(fr).places.parcDeLaPepiniere2,
      tagline: tx(fr).places.twentyOneHectaresOf,
      lat: 48.69725,
      lon: 6.18505,
      sections: [
        {
          heading: tx(fr).places.nancySGarden,
          body: tx(fr).places.createdInThe18th,
        },
        {
          heading: tx(fr).places.gettingThere,
          body: tx(fr).places.line16StopsAt,
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
      card: tx(fr).places.villaMajorelle,
      title: tx(fr).places.villaMajorelle,
      kicker: tx(fr).places.visitsDuringMuseumHours,
      headline: tx(fr).places.villaMajorelle2,
      tagline: tx(fr).places.theMasterpieceOfNancy,
      lat: 48.68551,
      lon: 6.16389,
      sections: [
        {
          heading: tx(fr).places.theEcoleDeNancy,
          body: tx(fr).places.builtIn1901And,
        },
        {
          heading: tx(fr).places.gettingThere,
          body: tx(fr).places.lineT3StopsAt,
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
  if (IS_NANCY) return nancyPlaces(language);
  return IS_CITY_SITE ? [] : grenoblePlaces(language);
}
