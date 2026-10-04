import type { ReactElement } from 'react';
import { FaShop } from 'react-icons/fa6';

const CATEGORY_COLORS: Array<{ match: RegExp; color: string }> = [
  { match: /pharmacy|hospital|clinic|doctors|dentist|healthcare|veterinary/, color: '#34d399' },
  { match: /restaurant|cafe|fast_food|bar|pub|biergarten|ice_cream|food_court|bakery|pastry|confectionery/, color: '#fb923c' },
  { match: /station|railway|bus_station|ferry_terminal/, color: '#60a5fa' },
  { match: /tourism|museum|attraction|theatre|cinema|leisure|park|sports|arts_centre|library/, color: '#a78bfa' },
  { match: /supermarket|convenience|mall|department_store|marketplace|greengrocer|butcher/, color: '#f472b6' },
  { match: /^shop/, color: '#38bdf8' },
];

export function placeColor(category: string): string {
  return CATEGORY_COLORS.find(entry => entry.match.test(category))?.color ?? '#fbbf24';
}

export function PlaceIcon({
  category,
  className,
  fallback,
}: {
  category?: string | null;
  className?: string;
  fallback: ReactElement;
}) {
  if (!category) return fallback;
  return <FaShop className={className} style={{ color: placeColor(category) }} aria-hidden="true" />;
}
