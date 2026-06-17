import { useEffect, useRef } from 'react';

/**
 * Keep the URL in sync with the currently-opened stop and its selected lines.
 *
 * URL format (matches the existing "Export configuration" feature):
 *   - No stop open                       → `/app`
 *   - Stop open, no line filter (all)    → `/app?T1=ALL_SEM:CHAVANT`
 *   - Stop open, single line filter      → `/app?T1=C_SEM:CHAVANT`
 *   - Stop open, multi-line filter       → `/app?T1=A_SEM:CHAVANT&T2=B_SEM:CHAVANT`
 *
 * Uses `history.replaceState` — no reload, no navigation, no visual change.
 *
 * Notes on `selectedLines`:
 *   - An empty Set means "show all" (the existing convention in your app),
 *     and we serialize it as `T1=ALL_<stopId>` to match your share format.
 *   - A non-empty Set is serialized as one `T<i>=<lineId>_<stopId>` per line,
 *     sorted alphabetically (same as the export modal does).
 */

export interface UseStopUrlSyncArgs {
  /** Currently opened stop id, or null/undefined if no stop is open. */
  stopId: string | null | undefined;
  /** Currently selected line ids. Empty set = "all lines". */
  selectedLines: Set<string>;
  /**
   * Optional base path override. If omitted, the current pathname is used —
   * this means the hook works on `/`, `/app`, or any other route without
   * forcing the user onto a specific path.
   */
  basePath?: string;
  /**
   * Optional toggle. Set to false during e.g. SSR or if you want to disable
   * the sync temporarily. Defaults to true.
   */
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