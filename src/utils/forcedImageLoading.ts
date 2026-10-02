let forced = false;
const listeners = new Set<() => void>();

export function isImageLoadingForced(): boolean {
  return forced;
}

export function setImageLoadingForced(value: boolean): void {
  if (forced === value) return;
  forced = value;
  for (const listener of listeners) listener();
}

export function subscribeImageLoadingForced(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
