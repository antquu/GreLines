/**
 * Le dernier passage de la journée.
 *
 * C'est l'information qui change une décision : attendre le suivant n'est plus
 * une option. Le badge la porte seul, et l'heure reste blanche comme les
 * autres : un mot se lit, quelle que soit la façon dont on perçoit les
 * couleurs, là où une heure teintée au milieu d'heures blanches passe pour une
 * anomalie plutôt que pour un repère.
 *
 * Un rectangle jaune, le mot en orange, en capitales d'Inter serrées : ce n'est
 * pas un intertitre, c'est une étiquette, elle doit tenir dans la largeur d'une
 * heure. « Dernier » suffit ; « Dernier passage » débordait de la colonne et
 * répétait le mot que porte déjà la ligne au-dessus.
 */
export function LastRunRibbon({ language }: { language: 'fr' | 'en' }) {
  return (
    <span className="inline-flex items-center rounded bg-amber-300 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-[0.06em] text-orange-700">
      {language === 'fr' ? 'Dernier' : 'Last'}
    </span>
  );
}

/**
 * La teinte de l'heure d'un dernier passage.
 *
 * Blanche, comme toutes les autres : le badge suffit à la désigner. La
 * constante reste, pour que la décision tienne en un seul endroit le jour où
 * l'on voudra de nouveau la teinter.
 */
export const LAST_RUN_TEXT = 'text-white';
