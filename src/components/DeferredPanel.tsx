import { Suspense, type ReactNode } from 'react';
import { useMountOnOpen } from '../hooks/useMountOnOpen';

interface DeferredPanelProps {
  
  isOpen: boolean;
  children: ReactNode;
}

export function DeferredPanel({ isOpen, children }: DeferredPanelProps) {
  const shouldMount = useMountOnOpen(isOpen);
  if (!shouldMount) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
}
