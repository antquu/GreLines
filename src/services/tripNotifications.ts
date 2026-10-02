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
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

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

export async function notifyTripMoment(moment: TripMoment, language: 'fr' | 'en'): Promise<void> {
  if (!notificationsEnabled()) return;

  const { title, body } = wording(moment, language === 'fr');
  if (moment.kind !== 'question') {
    const spoken = title.replace(/^[^\p{L}\p{N}]+/u, '');
    speak(body ? `${spoken}. ${body}` : spoken, language);
  }

  const options: NotificationOptions = {
    body,
    icon: '/flavicon.png',
    badge: '/flavicon.png',
    tag: `grelines-${moment.kind}`,
    silent: false,
  };

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch {
  }
}


const VOICE_KEY = 'greLines_tripVoice';

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
  }
}

export function voiceSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, language: 'fr' | 'en'): void {
  if (!voiceEnabled() || !voiceSupported() || !text) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'fr' ? 'fr-FR' : 'en-GB';
    utterance.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
  }
}
