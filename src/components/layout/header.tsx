'use client';

import { Moon, Sun, Contrast, Terminal, Sidebar, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLayoutStore, type Theme } from '@/stores/use-layout-store';

const THEME_ICONS: Record<Theme, React.ComponentType<{ className?: string }>> = {
  dark: Moon,
  light: Sun,
  'high-contrast': Contrast,
};

const THEME_CYCLE: Theme[] = ['dark', 'light', 'high-contrast'];

export function Header() {
  const theme = useLayoutStore((s) => s.theme);
  const setTheme = useLayoutStore((s) => s.setTheme);
  const togglePanel = useLayoutStore((s) => s.togglePanel);

  const ThemeIcon = THEME_ICONS[theme];

  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;
    setTheme(next);
  };

  return (
    <header className="flex h-10 items-center justify-between border-b bg-background px-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">ClaudeGUI</span>
        <span className="text-xs text-muted-foreground">v0.1.0</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanel('fileExplorer')}
          aria-label="Toggle sidebar"
          title="Toggle sidebar (⌘B)"
        >
          <Sidebar className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanel('terminal')}
          aria-label="Toggle terminal"
          title="Toggle terminal (⌘J)"
        >
          <Terminal className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanel('preview')}
          aria-label="Toggle preview"
          title="Toggle preview"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          aria-label="Toggle theme"
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
