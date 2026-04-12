'use client';

import { useEffect, useState } from 'react';
import { useLayoutStore, type Theme } from '@/stores/use-layout-store';

const THEME_CLASSES = ['dark', 'light', 'high-contrast', 'retro-green'];

function resolveSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(): void {
  const theme = useLayoutStore((s) => s.theme);
  const retroScanlines = useLayoutStore((s) => s.retroScanlines);
  const [systemResolved, setSystemResolved] = useState<'dark' | 'light'>(resolveSystemTheme);

  // Listen for OS color-scheme changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemResolved(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    // Sync on mount in case it changed between renders
    setSystemResolved(mq.matches ? 'dark' : 'light');
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const effectiveTheme: Theme = theme === 'system' ? systemResolved : theme;

    for (const cls of THEME_CLASSES) root.classList.remove(cls);
    root.classList.remove('retro-scanlines');

    root.classList.add(effectiveTheme);

    if (effectiveTheme === 'retro-green' && retroScanlines) {
      root.classList.add('retro-scanlines');
    }

    // Ensure native UI elements (scrollbars, form controls) follow the app theme
    const colorScheme = effectiveTheme === 'light' ? 'light' : 'dark';
    root.style.setProperty('color-scheme', colorScheme);
  }, [theme, retroScanlines, systemResolved]);
}
