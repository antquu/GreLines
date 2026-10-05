import { useCallback, useEffect, useRef } from 'react';

export type PanelId =
  | 'stop'
  | 'line'
  | 'address'
  | 'route'
  | 'timetable'
  | 'shared'
  | 'traffic'
  | 'linesExplorer'
  | 'settings';

export function usePanelManager(closers: Record<PanelId, () => void>) {
  const closersRef = useRef(closers);
  useEffect(() => { closersRef.current = closers; });
  return useCallback((keep: PanelId[] = []) => {
    for (const [id, close] of Object.entries(closersRef.current) as Array<[PanelId, () => void]>) {
      if (!keep.includes(id)) close();
    }
  }, []);
}
