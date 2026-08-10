'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

type MobileSearchContextValue = {
  isOpen: boolean;
  toggle: () => void;
  available: boolean;
  setAvailable: (value: boolean) => void;
};

const MobileSearchContext = createContext<MobileSearchContextValue | null>(null);

export function MobileSearchProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [available, setAvailable] = useState(false);

  // A page's search bar only makes sense on the route that registered it; reset on navigation.
  useEffect(() => {
    setIsOpen(false);
    setAvailable(false);
  }, [pathname]);

  const toggle = useCallback(() => setIsOpen((value) => !value), []);

  return (
    <MobileSearchContext.Provider value={{ isOpen, toggle, available, setAvailable }}>
      {children}
    </MobileSearchContext.Provider>
  );
}

export function useMobileSearch() {
  const ctx = useContext(MobileSearchContext);
  if (!ctx) throw new Error('useMobileSearch must be used within MobileSearchProvider');
  return ctx;
}
