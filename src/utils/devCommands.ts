/**
 * Les commandes de la console développeur, transmises par un évènement.
 *
 * La console ne connaît pas les écrans qu'elle pilote : elle annonce une
 * commande, et le composant concerné, s'il est affiché, la reçoit. Un écran
 * absent ne répond pas, sans qu'on ait à le savoir.
 */

const EVENT = 'grelines:dev-command';

interface DevCommandDetail {
  name: string;
  args: string[];
}

export function emitDevCommand(name: string, args: string[] = []): void {
  window.dispatchEvent(new CustomEvent<DevCommandDetail>(EVENT, { detail: { name, args } }));
}

/** Écoute une commande. Rend la fonction qui cesse d'écouter. */
export function onDevCommand(name: string, handler: (args: string[]) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<DevCommandDetail>).detail;
    if (detail?.name.toLowerCase() === name.toLowerCase()) handler(detail.args);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
