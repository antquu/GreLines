import { IoWifi } from 'react-icons/io5';

/**
 * Ce qu'affiche un panneau qui vit du réseau quand il n'y en a pas.
 *
 * Les vélos et trottinettes, les voitures partagées, la qualité de l'air,
 * l'infotrafic : rien de tout ça ne se garde d'avance, ça change à la minute.
 * Plutôt qu'une liste vide ou une erreur, le panneau le dit comme le fait
 * celui du covoiturage : un grand pictogramme gris, une phrase.
 */
export function OfflinePanel({
  language,
  isLight = false,
  detail,
}: {
  language: 'fr' | 'en';
  isLight?: boolean;
  /** Ce qui manque, en une phrase. Par défaut, une formule générale. */
  detail?: string;
}) {
  const isFr = language === 'fr';
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <IoWifi className={isLight ? 'text-slate-300' : 'text-slate-700'} size={96} aria-hidden="true" />
      <div className="mt-6">
        <p className={`text-xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
          {isFr ? 'Pas de connexion' : 'No connection'}
        </p>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          {detail ?? (isFr
            ? 'Ces informations arrivent en direct. Elles reviendront avec le réseau.'
            : 'This information comes live. It will be back with the network.')}
        </p>
      </div>
    </div>
  );
}
