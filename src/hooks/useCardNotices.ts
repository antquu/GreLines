/**
 * « Nouvelle notification sur la carte de … »
 *
 * Les messages du réseau vivent dans le portefeuille, et le portefeuille est un
 * écran qu'on n'ouvre pas tous les jours. Un message qui y attend n'est pas lu.
 * On l'annonce donc à l'ouverture de l'application, par la pastille du haut —
 * la même que pour une adresse copiée : un avis, pas une alerte.
 *
 * Chaque message n'est annoncé qu'une fois. Les identifiants déjà vus sont
 * gardés localement : c'est propre à l'appareil, comme le portefeuille, et il
 * n'y a rien à écrire côté réseau pour cela.
 */

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

/** Au-delà, on oublie les plus anciens : ils ne reviendront jamais. */
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
    // Stockage refusé : l'avis se represente à la prochaine ouverture. C'est
    // moins bien que de l'annoncer une fois, c'est mieux que de le taire.
  }
}

export interface CardNotice {
  notification: OuraNotification;
  card: OuraCard;
  /** Le nom du porteur, ou le numéro de la carte à défaut. */
  cardLabel: string;
}

function labelOf(card: OuraCard): string {
  const name = [card.firstName, card.lastName].filter(Boolean).join(' ').trim();
  return name || card.cardCode;
}

/**
 * Le premier message non annoncé, s'il y en a un.
 *
 * `dismiss` le retire et le marque comme vu : le suivant, s'il y en avait
 * plusieurs, prend sa place à la prochaine vérification plutôt que d'empiler
 * trois pastilles l'une sur l'autre.
 */
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
        // Le plus récent d'abord : `listNotifications` rend déjà la liste
        // triée. On s'arrête au premier inconnu — annoncer le troisième
        // message d'hier avant celui de ce matin n'aurait aucun sens.
        const fresh = notifications.find(entry => !seen.has(entry.id));
        if (fresh) {
          setNotice({ notification: fresh, card, cardLabel: labelOf(card) });
          return;
        }
        // Rien de neuf sur cette carte : on note quand même ce qu'on a vu, pour
        // qu'un message effacé puis réécrit ne reparte pas de zéro.
        notifications.forEach(entry => seen.add(entry.id));
      }
      writeSeen(seen);
    };

    void check();
    // Un message écrit depuis le panneau d'administration arrive en direct :
    // on revérifie plutôt que d'attendre la prochaine ouverture.
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
