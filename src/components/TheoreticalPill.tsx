/**
 * L'heure vient de la fiche horaire, pas du véhicule.
 *
 * Hors connexion, ou pour une ligne que le temps réel ne montrait pas, on
 * affiche l'heure prévue par le réseau. Elle peut être juste comme elle peut
 * avoir quelques minutes d'écart : la pastille le dit, à côté de la
 * destination, là où l'oeil se pose pour savoir de quel bus il s'agit.
 *
 * Même gabarit que l'étiquette « Dernier », dans un gris neutre : c'est une
 * nuance sur l'heure, pas une alerte.
 */
export function TheoreticalPill({ language }: { language: 'fr' | 'en' }) {
  const isFr = language === 'fr';
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-[0.06em] text-slate-300"
      title={isFr ? 'Horaire prévu, sans suivi en direct' : 'Scheduled time, not tracked live'}
    >
      {isFr ? 'Théorique' : 'Scheduled'}
    </span>
  );
}
