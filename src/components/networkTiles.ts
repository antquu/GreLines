/**
 * Les plaques des réseaux, partagées par les deux endroits qui les proposent.
 *
 * Les réglages les affichent en grand ; la feuille des préférences d'itinéraire
 * les reprend en petit, juste sous les curseurs de marche. Ce sont les mêmes
 * réseaux et le même réglage enregistré — décocher Cars Région ici le décoche
 * là-bas. Les données vivent donc à part, dans ce fichier, plutôt que chez l'un
 * des deux : sans quoi la feuille importerait tout le panneau des réglages pour
 * deux tableaux, et les deux listes finiraient par diverger.
 *
 * Les logos vivent dans `/assets/network/`, à part du reste. Le pictogramme du
 * TER s'appelle `ter.png` et sert déjà au badge de ligne : deux fichiers du même
 * nom pour deux usages différents finissent par se marcher dessus. Un dossier
 * propre au sélecteur règle la question une fois.
 *
 * Les suffixes d'état sélectionné ne sont pas uniformes — `-selectioned`,
 * `-selectionned`, `-selected` selon le fichier — alors on les écrit en toutes
 * lettres plutôt que de les déduire : une convention qu'on invente ici ne
 * renommerait pas les fichiers pour autant.
 */

import { NETWORKS } from '../services/api';

export const NETWORK_ASSETS = '/assets/network';

export type NetworkTile = {
  asset: string;
  selectedAsset: string;
  codes: string[];
  label: string;
};

/** Les autorités organisatrices, celles qui portent le réseau structurant. */
export const NETWORK_TILES: NetworkTile[] = [
  { asset: 'Metropole', selectedAsset: 'Metropole-selectioned', codes: ['SEM', 'SE2'], label: 'Métropole' },
  { asset: 'Gresivaudan', selectedAsset: 'Gresivaudan-selectioned', codes: ['GSV'], label: 'Grésivaudan' },
  { asset: 'Voironnais', selectedAsset: 'Voironnais-selected', codes: ['TPV'], label: 'Pays Voironnais' },
  { asset: 'Region', selectedAsset: 'Region-selectioned', codes: ['C38'], label: 'Cars Région' },
];

/** Les opérateurs qui s'ajoutent aux précédents, chacun avec sa plaque. */
export const OPERATOR_TILES: NetworkTile[] = [
  { asset: 'Bulle', selectedAsset: 'Bulle-selectionned', codes: ['BUL'], label: 'Bulles' },
  { asset: 'Transaltitude', selectedAsset: 'Transaltitude-selectionned', codes: ['TRA'], label: 'Transaltitude' },
  { asset: 'MCovoit', selectedAsset: 'MCovoit-selectionned', codes: ['MCO'], label: "M'Covoit" },
  { asset: 'TER', selectedAsset: 'TER-selectionned', codes: ['SNC'], label: 'TER' },
  { asset: 'TCL', selectedAsset: 'TCL-selectionned', codes: ['TCL'], label: 'TCL' },
];

/** Les véhicules en libre-service, qui ne sont pas des réseaux de lignes. */
export const SHARED_TILES: Array<{
  asset: string;
  selectedAsset: string;
  setting: 'citiz' | 'voi';
  label: string;
}> = [
  { asset: 'citiz', selectedAsset: 'Citiz-selectionned', setting: 'citiz', label: 'Citiz' },
  { asset: 'voi', selectedAsset: 'voi-selectionned', setting: 'voi', label: 'Voi' },
];

/** Codes couverts par une vignette : le reste garde son interrupteur. */
export const TILE_CODES = new Set([...NETWORK_TILES, ...OPERATOR_TILES].flatMap(tile => tile.codes));
export const SECONDARY_NETWORKS = NETWORKS.filter(network => !TILE_CODES.has(network.code));

/**
 * Cocher ou décocher un réseau, à partir de la sélection en vigueur.
 *
 * Une vignette porte parfois deux codes (Tag, c'est SEM et SE2) : on ne la
 * considère allumée que si les deux le sont, et l'éteindre les retire tous les
 * deux. Le repli sur la Métropole évite l'état où plus rien n'est coché, où
 * l'application n'aurait aucun arrêt à afficher et paraîtrait cassée.
 */
export function toggleNetworkCodes(current: string[], codes: string[]): string[] {
  const active = codes.every(code => current.includes(code));
  const next = active
    ? current.filter(code => !codes.includes(code))
    : [...new Set([...current, ...codes])];
  return next.length > 0 ? next : ['SEM', 'SE2'];
}
