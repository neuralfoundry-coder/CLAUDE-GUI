'use client';

import { useEffect } from 'react';
import { useLayoutStore } from '@/stores/use-layout-store';

export function useTheme(): void {
  const theme = useLayoutStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light', 'high-contrast');
    root.classList.add(theme);
  }, [theme]);
}
