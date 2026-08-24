/**
 * Les pictogrammes du sommaire.
 *
 * Un seul jeu, dessiné au trait, sans remplissage, sur une grille de 24 : à la
 * taille où ils sont affichés, seize pixels, un trait vaut mieux qu'une forme
 * pleine, qui deviendrait une tache. Ils prennent la couleur du texte, donc ils
 * suivent le thème sans qu'on ait à y penser.
 *
 * Ils ne décorent pas, ils repèrent. Dans une colonne de trente entrées, on ne
 * lit pas les titres un par un : on cherche la forme qu'on a déjà vue. C'est
 * pour ça qu'un même pictogramme ne sert jamais deux fois.
 */

export type IconName =
  | 'book'
  | 'play'
  | 'download'
  | 'search'
  | 'route'
  | 'star'
  | 'card'
  | 'alert'
  | 'terminal'
  | 'branch'
  | 'key'
  | 'rocket'
  | 'database'
  | 'server'
  | 'globe'
  | 'plug'
  | 'monitor'
  | 'printer'
  | 'layers'
  | 'clipboard'
  | 'shield'
  | 'lock'
  | 'message'
  | 'activity'
  | 'mail'
  | 'network';

/** Le tracé de chaque pictogramme, sans le `svg` qui l'entoure. */
const PATHS: Record<IconName, React.ReactNode> = {
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8.5 6 3.5-6 3.5Z" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v11" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4 18v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18h5a4 4 0 0 0 0-8h-3a4 4 0 0 1 0-8" />
    </>
  ),
  star: <path d="m12 4 2.4 5 5.6.8-4 4 .9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-4 5.6-.8Z" />,
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 3 19h18Z" />
      <path d="M12 10v4M12 16.5v.5" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 10 2.5 2L7 14M13 15h4" />
    </>
  ),
  branch: (
    <>
      <circle cx="7" cy="5" r="2.2" />
      <circle cx="7" cy="19" r="2.2" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M7 7.2v9.6M17 11.2c0 3-3 3.8-6 3.8" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3M15.5 12v2.5" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 3c3.5 2.2 5.5 6 5.5 10l-2.5 3h-6l-2.5-3C6.5 9 8.5 5.2 12 3Z" />
      <circle cx="12" cy="10" r="1.6" />
      <path d="M9 19c0 1.2.9 2 3 2s3-.8 3-2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h.5M7 16.5h.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3Z" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v6M15 3v6" />
      <path d="M6 9h12v2a6 6 0 0 1-6 6 6 6 0 0 1-6-6Z" />
      <path d="M12 17v4" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V3.5h10V8" />
      <rect x="3" y="8" width="18" height="8" rx="2" />
      <path d="M7 13h10v7.5H7Z" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5Z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3h6v1.5" />
      <path d="M9 10h6M9 14h4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5.5c0 4 3 7.5 7 9.5 4-2 7-5.5 7-9.5V6Z" />
      <path d="m9.5 12 1.8 1.8L15 10.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
  message: (
    <>
      <path d="M20.5 12.5c0 4-3.8 7-8.5 7a10 10 0 0 1-2.6-.3L4 21l1.2-3.6A6.7 6.7 0 0 1 3.5 12.5c0-4 3.8-7 8.5-7s8.5 3 8.5 7Z" />
    </>
  ),
  activity: <path d="M3 12.5h4l2.5-7 4 14 2.5-7h5" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5" cy="18" r="2.2" />
      <circle cx="19" cy="18" r="2.2" />
      <path d="M12 7.2v4.3M12 11.5 6.2 16M12 11.5 17.8 16" />
    </>
  ),
};

export function DocIcon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
