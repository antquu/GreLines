const EVENT = 'grelines:dev-command';

interface DevCommandDetail {
  name: string;
  args: string[];
}

export function emitDevCommand(name: string, args: string[] = []): void {
  window.dispatchEvent(new CustomEvent<DevCommandDetail>(EVENT, { detail: { name, args } }));
}

export function onDevCommand(name: string, handler: (args: string[]) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<DevCommandDetail>).detail;
    if (detail?.name.toLowerCase() === name.toLowerCase()) handler(detail.args);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
