/**
 * Les avis de trajet, poussés sur l'écran verrouillé.
 *
 * Le guidage ne sert à rien s'il faut le regarder. On sort le téléphone pour
 * savoir s'il faut partir, on le range, on le ressort trois minutes plus tard : le
 * seul moment où l'écran mérite d'être allumé est celui où quelque chose change.
 * Ces avis remplacent la surveillance par une interruption — partez, votre bus
 * arrive, prenez la correspondance, vous êtes arrivé.
 *
 * Ce sont des notifications *locales* : l'application les affiche elle-même
 * pendant qu'elle tourne. Elles ne demandent aucun serveur. Les vraies
 * notifications poussées, celles qui arrivent application fermée, exigent un
 * service d'envoi avec ses clés VAPID — ce qui n'existe pas encore ici, et
 * prétendre l'avoir en donnant des avis qui ne partiront jamais serait pire que
 * de ne rien annoncer.
 */

const ENABLED_KEY = 'greLines_tripNotifications';

export function notificationsEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setNotificationsEnabled(value: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, value ? 'on' : 'off');
  } catch {
    // Navigation privée : le choix vaudra pour cette session.
  }
}

/** L'autorisation du navigateur, telle qu'elle est à cet instant. */
export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/**
 * Demande l'autorisation, si elle n'a pas déjà été donnée ou refusée.
 *
 * À n'appeler que depuis un geste de l'usager : les navigateurs rejettent — et
 * iOS mémorise le refus — une demande qui surgit au chargement.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Les moments d'un trajet qui méritent une interruption.
 *
 * Un par étape franchie, pas un de plus. Une notification par arrêt aurait fait
 * du téléphone une sonnerie continue, et l'on aurait coupé l'ensemble.
 */
export type TripMoment =
  | { kind: 'leave' }
  | { kind: 'boarding'; line: string; stop?: string | null }
  | { kind: 'transfer'; line: string; headsign?: string | null }
  | { kind: 'getOff'; stop?: string | null }
  | { kind: 'arrived'; place?: string | null }
  | { kind: 'question' };

function wording(moment: TripMoment, isFr: boolean): { title: string; body?: string } {
  switch (moment.kind) {
    case 'leave':
      return {
        title: isFr ? '🚶 Partez maintenant' : '🚶 Leave now',
        body: isFr
          ? 'C’est le moment de vous mettre en route.'
          : 'Time to set off.',
      };
    case 'boarding':
      return {
        title: isFr ? `🚏 Votre ${moment.line} arrive` : `🚏 Your ${moment.line} is arriving`,
        body: moment.stop
          ? isFr
            ? `À ${moment.stop}.`
            : `At ${moment.stop}.`
          : undefined,
      };
    case 'transfer':
      return {
        title: isFr ? '🔁 Correspondance' : '🔁 Transfer',
        body: moment.headsign
          ? isFr
            ? `Prenez la ${moment.line} direction ${moment.headsign}.`
            : `Take the ${moment.line} toward ${moment.headsign}.`
          : isFr
          ? `Prenez la ${moment.line}.`
          : `Take the ${moment.line}.`,
      };
    case 'getOff':
      return {
        title: isFr ? '🚪 Descendez au prochain arrêt' : '🚪 Get off at the next stop',
        body: moment.stop ?? undefined,
      };
    case 'arrived':
      return {
        title: isFr ? '🏁 Vous êtes arrivé' : '🏁 You have arrived',
        body: moment.place ?? undefined,
      };
    case 'question':
      return {
        title: isFr ? '💬 Une question sur ce trajet' : '💬 A question about this trip',
        body: isFr
          ? 'Deux secondes pour aider les voyageurs suivants.'
          : 'Two seconds to help the next travellers.',
      };
  }
}

/**
 * Affiche un avis, si tout le permet.
 *
 * On passe par le service worker quand il est là : sur Android et sur iOS en
 * mode autonome, une notification créée directement depuis la page est refusée.
 * `new Notification()` ne sert que de repli sur ordinateur.
 */
export async function notifyTripMoment(moment: TripMoment, language: 'fr' | 'en'): Promise<void> {
  if (!notificationsEnabled()) return;

  const { title, body } = wording(moment, language === 'fr');
  /*
   * La voix suit le même chemin que la notification : un seul endroit décide de
   * ce qui s'annonce, et les deux ne peuvent pas se contredire.
   *
   * Sauf pour les questions. Dire « une question sur ce trajet » puis laisser
   * l'usager lire l'écran serait une annonce pour rien : c'est le questionnaire
   * lui-même qui prononce la question, et il la connaît. Faire les deux ici
   * couperait la vraie phrase au profit de son annonce.
   */
  if (moment.kind !== 'question') {
    // Le titre est dépouillé de son émoji avant d'être dit : une voix qui
    // prononce « bus » ou « globe avec flèches » au début de chaque phrase rend
    // l'annonce ridicule, et certaines synthèses le font.
    const spoken = title.replace(/^[^\p{L}\p{N}]+/u, '');
    speak(body ? `${spoken}. ${body}` : spoken, language);
  }

  const options: NotificationOptions = {
    body,
    // L'icône du site, la seule qui existe : `/icons/icon-192.png` n'a jamais été
    // déposée, et une icône introuvable donne une notification sans image plutôt
    // qu'une erreur — le genre de défaut qui passe inaperçu longtemps.
    icon: '/flavicon.png',
    badge: '/flavicon.png',
    // Une balise par nature d'avis : un second « votre bus arrive » remplace le
    // premier au lieu d'empiler deux fois la même phrase.
    tag: `grelines-${moment.kind}`,
    silent: false,
  };

  // La notification visuelle demande une autorisation ; la voix non. Refuser les
  // notifications ne doit donc pas rendre la voix muette.
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch {
    // Refus du navigateur ou onglet en fond : l'écran de guidage reste la source.
  }
}

/* -------------------------------------------------------------------------- */
/*  La voix                                                                   */
/* -------------------------------------------------------------------------- */

const VOICE_KEY = 'greLines_tripVoice';

/**
 * Dire les consignes à haute voix.
 *
 * Une notification demande de regarder l'écran ; une phrase dite ne demande rien.
 * C'est la différence entre chercher son téléphone dans un couloir de
 * correspondance et l'entendre annoncer la ligne à prendre, ce qui est
 * exactement le moment où l'on a les mains prises.
 *
 * Coupé par défaut : une application qui se met à parler sans prévenir, dans un
 * tram, se fait couper le son puis désinstaller.
 */
export function voiceEnabled(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setVoiceEnabled(value: boolean): void {
  try {
    localStorage.setItem(VOICE_KEY, value ? 'on' : 'off');
  } catch {
    // Navigation privée : le choix vaudra pour cette session.
  }
}

export function voiceSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Prononce une phrase, en coupant celle d'avant.
 *
 * `cancel()` d'abord : les annonces se remplacent au lieu de s'empiler. Arriver à
 * un arrêt pendant que la précédente parle encore donnerait deux voix
 * superposées, et c'est la nouvelle qui compte.
 */
export function speak(text: string, language: 'fr' | 'en'): void {
  if (!voiceEnabled() || !voiceSupported() || !text) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'fr' ? 'fr-FR' : 'en-GB';
    // Un peu plus lent que la valeur par défaut : une consigne de trajet se
    // comprend du premier coup ou ne sert à rien.
    utterance.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    // Voix indisponible : la notification et l'écran restent.
  }
}
