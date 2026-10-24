import { useEffect, useSyncExternalStore } from 'react';

const shown = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// tell the app a popup is on screen, so sheets do not open on their own behind it
export function usePopupPresence(id: string, visible: boolean) {
  useEffect(() => {
    if (!visible) return;
    shown.add(id);
    notify();
    return () => {
      shown.delete(id);
      notify();
    };
  }, [id, visible]);
}

export function useAnyPopupShown(): boolean {
  return useSyncExternalStore(subscribe, () => shown.size > 0, () => false);
}
