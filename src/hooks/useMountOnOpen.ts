import { useState } from 'react';

export function useMountOnOpen(isOpen: boolean): boolean {
  const [hasOpened, setHasOpened] = useState(isOpen);
  if (isOpen && !hasOpened) {
    
    setHasOpened(true);
  }
  return hasOpened;
}
