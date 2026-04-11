'use client';

import { useEffect } from 'react';
import { useLayoutStore } from '@/stores/use-layout-store';

const THEME_CLASSES = ['dark', 'light', 'high-contrast', 'retro-green'];

export function useTheme(): void {
  const theme = useLayoutStore((s) => s.theme);
  const retroScanlines = useLayoutStore((s) => s.retroScanlines);

  useEffect(() => {
    const root = document.documentElement;
    for (const cls of THEME_CLASSES) root.classList.remove(cls);
    root.classList.add(theme);
    if (theme === 'retro-green' && retroScanlines) {
      root.classList.add('retro-scanlines');
    } else {
      root.classList.remove('retro-scanlines');
    }
  }, [theme, retroScanlines]);
}
