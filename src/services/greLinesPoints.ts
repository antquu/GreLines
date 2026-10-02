const STORAGE_KEY = 'greLines_points';

export interface PointsLedger {
  points: number;
  trips: number;
  travellersHelped: number;
}

const EMPTY: PointsLedger = { points: 0, trips: 0, travellersHelped: 0 };

const POINTS_PER_TRIP = 10;
const POINTS_PER_CONTRIBUTION = 5;

export function loadPoints(): PointsLedger {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      points: Number(parsed?.points) || 0,
      trips: Number(parsed?.trips) || 0,
      travellersHelped: Number(parsed?.travellersHelped) || 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

export interface TripAward {
  points: number;
  travellersHelped: number;
  total: PointsLedger;
}

export function awardTrip(contributions: {
  observations: number;
  answers: number;
  travellersHelped?: number;
}): TripAward {
  const useful = Math.max(0, contributions.observations) + Math.max(0, contributions.answers);
  const points = POINTS_PER_TRIP + useful * POINTS_PER_CONTRIBUTION;
  const travellersHelped = Math.max(1, contributions.travellersHelped ?? useful);

  const previous = loadPoints();
  const total: PointsLedger = {
    points: previous.points + points,
    trips: previous.trips + 1,
    travellersHelped: previous.travellersHelped + travellersHelped,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(total));
  } catch {
  }

  return { points, travellersHelped, total };
}
