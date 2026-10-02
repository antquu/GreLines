import { useEffect, useState } from 'react';
import {
  isSupabaseConfigured,
  listNotifications,
  listOuraCards,
  subscribeToCards,
  type OuraCard,
  type OuraNotification,
} from '../services/ouraCard';

const STORAGE_KEY = 'greLines_seenNotifications_v1';

const MAX_REMEMBERED = 200;

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen].slice(-MAX_REMEMBERED)));
  } catch {
  }
}

export interface CardNotice {
  notification: OuraNotification;
  card: OuraCard;
  cardLabel: string;
}

function labelOf(card: OuraCard): string {
  const name = [card.firstName, card.lastName].filter(Boolean).join(' ').trim();
  return name || card.cardCode;
}

export function useCardNotices(enabled: boolean): {
  notice: CardNotice | null;
  dismiss: () => void;
} {
  const [notice, setNotice] = useState<CardNotice | null>(null);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;
    let cancelled = false;

    const check = async () => {
      const cards = await listOuraCards();
      if (cancelled || cards.length === 0) return;

      const seen = readSeen();
      for (const card of cards) {
        const notifications = await listNotifications(card.cardCode);
        if (cancelled) return;
        const fresh = notifications.find(entry => !seen.has(entry.id));
        if (fresh) {
          setNotice({ notification: fresh, card, cardLabel: labelOf(card) });
          return;
        }
        notifications.forEach(entry => seen.add(entry.id));
      }
      writeSeen(seen);
    };

    void check();
    const unsubscribe = subscribeToCards(() => { void check(); });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled]);

  return {
    notice,
    dismiss: () => {
      setNotice(current => {
        if (current) {
          const seen = readSeen();
          seen.add(current.notification.id);
          writeSeen(seen);
        }
        return null;
      });
    },
  };
}
