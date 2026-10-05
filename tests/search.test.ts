import { beforeEach, describe, expect, it } from 'vitest';
import { rankSearchResults, setSearchFocus, type AddressResult } from '../src/services/geocoding';

const place = (name: string, lat: number, lon: number, category: string | undefined = 'amenity:pharmacy'): AddressResult => ({
  label: name,
  name,
  context: '',
  lat,
  lon,
  score: 1,
  id: `${name}-${lat}`,
  category,
});

describe('rankSearchResults', () => {
  beforeEach(() => setSearchFocus(45.1885, 5.7245));

  it('puts a nearby match before a far one', () => {
    const far = place('Pharmacie du Lac', 45.9, 6.1);
    const near = place('Pharmacie Vox', 45.1877, 5.7216);
    expect(rankSearchResults([far, near], [], 'pharmacie')[0]).toBe(near);
  });

  it('hides far results when there are enough nearby ones', () => {
    const nearby = [place('Pharmacie A', 45.19, 5.72), place('Pharmacie B', 45.18, 5.73), place('Pharmacie C', 45.2, 5.71)];
    const far = place('Pharmacie', 42.6, 3.0);
    const ranked = rankSearchResults([...nearby, far], [], 'pharmacie');
    expect(ranked).not.toContain(far);
    expect(ranked).toHaveLength(3);
  });

  it('follows the map when the focus moves', () => {
    setSearchFocus(48.6921, 6.1844);
    const grenoble = place('Boulangerie Cagol', 45.19, 5.72, 'shop:bakery');
    const nancy = place('Boulangerie Saint-Jean', 48.69, 6.18, 'shop:bakery');
    expect(rankSearchResults([grenoble, nancy], [], 'boulangerie')[0]).toBe(nancy);
  });

  it('keeps street addresses first for a numbered query', () => {
    const shop = place('Pharmacie 12', 45.19, 5.72);
    const address = place('12 Rue de Bonne', 45.19, 5.72, undefined);
    expect(rankSearchResults([shop], [address], '12 rue de bonne')[0]).toBe(address);
  });
});
