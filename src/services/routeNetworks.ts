/**
 * Les réseaux retenus pour le calcul d'itinéraire.
 *
 * À ne pas confondre avec la sélection des réglages, qui décide de ce que la
 * carte affiche. Ici, il ne s'agit pas d'affichage : on dit par où l'on accepte
 * de passer. Quelqu'un qui n'a pas d'abonnement TER veut continuer de voir les
 * gares sur la carte, mais pas se faire proposer un trajet en train ; les deux
 * réglages ont beau porter les mêmes noms, ils ne répondent pas à la même
 * question et ne peuvent donc pas être le même réglage.
 *
 * Le choix reste sur l'appareil et vaut pour les recherches suivantes.
 */

const STORAGE_KEY = 'greLines_routeNetworks';

export interface RouteNetwork {
  /** Le préfixe que porte l'identifiant de ligne, « SEM:C1 » donnant « SEM ». */
  code: string;
  label: string;
  /** Certains réseaux sont découpés en plusieurs jeux de données. */
  aliases?: string[];
}

/**
 * Les réseaux qu'un itinéraire peut réellement emprunter.
 *
 * Les mobilités partagées n'y figurent pas : elles ne sont pas des lignes, et
 * leurs options apparaissent déjà séparément sous « Autres options ».
 */
export const ROUTE_NETWORKS: RouteNetwork[] = [
  { code: 'SEM', label: 'Métropole (Tag)', aliases: ['SE2'] },
  { code: 'GSV', label: 'Grésivaudan' },
  { code: 'TPV', label: 'Pays Voironnais' },
  { code: 'BUL', label: 'Bulles de Grenoble' },
  { code: 'FUN', label: 'Funiculaire des Petites Roches' },
  { code: 'TRA', label: 'Transaltitude' },
  { code: 'MCO', label: "M'Covoit ligne+" },
  { code: 'SNC', label: 'TER' },
  { code: 'C38', label: 'Cars Région' },
];

/** Tous les codes d'un réseau, principal et variantes réunis. */
export function networkCodes(network: RouteNetwork): string[] {
  return [network.code, ...(network.aliases ?? [])];
}

/** Par défaut, tout est accepté : on ne retire rien à qui n'a rien demandé. */
export function defaultRouteNetworks(): string[] {
  return ROUTE_NETWORKS.map(network => network.code);
}

export function loadRouteNetworks(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultRouteNetworks();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultRouteNetworks();
    const known = parsed.filter(
      (code): code is string => typeof code === 'string' && ROUTE_NETWORKS.some(n => n.code === code),
    );
    return known.length > 0 ? known : defaultRouteNetworks();
  } catch {
    return defaultRouteNetworks();
  }
}

export function saveRouteNetworks(codes: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  } catch {
    /* Navigation privée, quota plein : le réglage vaut pour cette session. */
  }
}

/**
 * Le réseau dont relève une étape, d'après l'identifiant que porte sa ligne.
 *
 * OTP préfixe ses identifiants du code du fournisseur de données — « SEM:C1 »,
 * « SNC:TER ». Une étape à pied ou à vélo n'a pas de ligne du tout, et ne
 * relève donc d'aucun réseau : elle ne peut jamais faire écarter un itinéraire.
 */
export function legNetworkCode(leg: unknown): string | null {
  const source = leg as { routeId?: unknown; agencyId?: unknown; route?: unknown } | null;
  if (!source) return null;
  for (const value of [source.routeId, source.agencyId, source.route]) {
    if (typeof value !== 'string') continue;
    const prefix = value.includes(':') ? value.slice(0, value.indexOf(':')) : '';
    if (prefix) return prefix.toUpperCase();
  }
  return null;
}

/**
 * L'itinéraire n'emprunte que des réseaux acceptés.
 *
 * Un seul passage par un réseau écarté suffit à écarter l'itinéraire entier :
 * proposer un trajet dont une correspondance est refusée reviendrait à ne pas
 * tenir compte du réglage du tout.
 */
export function itineraryUsesOnly(legs: unknown[], accepted: Set<string>): boolean {
  return legs.every(leg => {
    const code = legNetworkCode(leg);
    if (!code) return true;
    const network = ROUTE_NETWORKS.find(n => networkCodes(n).includes(code));
    if (!network) return true;
    return accepted.has(network.code);
  });
}
