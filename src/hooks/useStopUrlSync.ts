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
  const linesSignature = Array.from(selectedLines).sort().join(',');
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const path = basePath ?? window.location.pathname;
    const target = buildTargetUrl(path, stopId, selectedLines);
    const current = window.location.pathname + window.location.search;

    if (target === current) {
      lastWrittenRef.current = target;
      return;
    }
    if (lastWrittenRef.current === target) return;

    window.history.replaceState(window.history.state, '', target);
    lastWrittenRef.current = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId, linesSignature, basePath, enabled]);
};