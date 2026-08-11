import { useEffect, useRef } from 'react';



















export interface UseStopUrlSyncArgs {
  
  stopId: string | null | undefined;
  
  selectedLines: Set<string>;
  




  basePath?: string;
  



  enabled?: boolean;
}

const buildStopQueryString = (stopId: string, selectedLines: Set<string>): string => {
  if (selectedLines.size === 0) {
    return `T1=ALL_${stopId}`;
  }
  return Array.from(selectedLines)
    .sort()
    .map((lineId, i) => `T${i + 1}=${lineId}_${stopId}`)
    .join('&');
};

const buildTargetUrl = (
  basePath: string,
  stopId: string | null | undefined,
  selectedLines: Set<string>
): string => {
  if (!stopId) return basePath;
  const qs = buildStopQueryString(stopId, selectedLines);
  return qs ? `${basePath}?${qs}` : basePath;
};

export const useStopUrlSync = ({
  stopId,
  selectedLines,
  basePath,
  enabled = true,
}: UseStopUrlSyncArgs): void => {
  // Stable signature of the lines set, so we don't re-run on identity change.
  const linesSignature = Array.from(selectedLines).sort().join(',');
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // Default to the *current* pathname so we don't force the user onto a
    // specific route — works equally well on `/`, `/app`, etc.
    const path = basePath ?? window.location.pathname;
    const target = buildTargetUrl(path, stopId, selectedLines);
    const current = window.location.pathname + window.location.search;

    // Skip writing if nothing changed — both vs the actual URL and vs what
    // we last wrote (guards against fights with other URL writers).
    if (target === current) {
      lastWrittenRef.current = target;
      return;
    }
    if (lastWrittenRef.current === target) return;

    window.history.replaceState(window.history.state, '', target);
    lastWrittenRef.current = target;
    // We intentionally depend on linesSignature instead of selectedLines
    // to avoid spurious reruns on Set identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId, linesSignature, basePath, enabled]);
};