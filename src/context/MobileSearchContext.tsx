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

  // Close the panel on navigation. Availability is owned by each page and is
  // cleaned up when that page unmounts, avoiding a parent/child effect race.
  useEffect(() => {
    setIsOpen(false);
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
