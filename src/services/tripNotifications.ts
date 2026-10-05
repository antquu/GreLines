import { tx } from '../i18n';
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
        title: tx(isFr).tripNotifications.leaveNow,
        body: tx(isFr).tripNotifications.timeToSetOff,
      };
    case 'boarding':
      return {
        title: tx(isFr).tripNotifications.yourLineIsArriving(moment.line),
        body: moment.stop
          ? tx(isFr).tripNotifications.atStop(moment.stop)
          : undefined,
      };
    case 'transfer':
      return {
        title: tx(isFr).tripNotifications.transfer,
        body: moment.headsign
          ? tx(isFr).tripNotifications.takeTheLineToward(moment.line, moment.headsign)
          : tx(isFr).tripNotifications.takeTheLine(moment.line),
      };
    case 'getOff':
      return {
        title: tx(isFr).tripNotifications.getOffAtThe,
        body: moment.stop ?? undefined,
      };
    case 'arrived':
      return {
        title: tx(isFr).tripNotifications.youHaveArrived,
        body: moment.place ?? undefined,
      };
    case 'question':
      return {
        title: tx(isFr).tripNotifications.aQuestionAboutThis,
        body: tx(isFr).tripNotifications.twoSecondsToHelp,
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
    utterance.lang = tx(language === 'fr').tripNotifications.locale;
    utterance.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
  }
}
