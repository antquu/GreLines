export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches === true ||
    iosStandalone === true
  );
}

export function openExternal(url: string): void {
  if (typeof window === 'undefined') return;

  if (isStandaloneApp()) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer external';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
