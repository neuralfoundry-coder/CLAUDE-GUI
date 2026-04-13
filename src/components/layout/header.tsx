'use client';

import {
  Moon, Sun, Contrast, ExternalLink, Sidebar, Eye, FolderOpen, MonitorSmartphone,
  Monitor, Code2, MessageSquare, Globe, Blocks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLayoutStore, type Theme } from '@/stores/use-layout-store';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';
import { useProjectStore } from '@/stores/use-project-store';
import { useRemoteAccessStore } from '@/stores/use-remote-access-store';
import { useMcpStore } from '@/stores/use-mcp-store';
import { terminalApi } from '@/lib/api-client';
import { AuthBadge } from './auth-badge';
import { SettingsPopover } from './settings-popover';

const THEME_ICONS: Record<Theme, React.ComponentType<{ className?: string }>> = {
  dark: Moon,
  light: Sun,
  'high-contrast': Contrast,
  'retro-green': MonitorSmartphone,
  system: Monitor,
};

const THEME_CYCLE: Theme[] = ['dark', 'light', 'high-contrast', 'retro-green', 'system'];

interface HeaderProps {
  onOpenProjectPicker?: () => void;
  onOpenLoginPrompt?: () => void;
}

function basename(p: string | null): string {
  if (!p) return '(no project)';
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

export function Header({ onOpenProjectPicker, onOpenLoginPrompt }: HeaderProps) {
  const theme = useLayoutStore((s) => s.theme);
  const setTheme = useLayoutStore((s) => s.setTheme);
  const togglePanelByType = useSplitLayoutStore((s) => s.togglePanelByType);
  const activeRoot = useProjectStore((s) => s.activeRoot);
  const remoteAccess = useRemoteAccessStore((s) => s.remoteAccess);
  const localIPs = useRemoteAccessStore((s) => s.localIPs);
  const openRemoteModal = useRemoteAccessStore((s) => s.openModal);
  const mcpServers = useMcpStore((s) => s.servers);
  const openMcpModal = useMcpStore((s) => s.openModal);
  const enabledMcpCount = Object.values(mcpServers).filter((s) => s.enabled).length;

  const ThemeIcon = THEME_ICONS[theme];

  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;
    setTheme(next);
  };

  return (
    <header className="flex h-10 items-center justify-between border-b glass-surface glass-highlight relative px-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">ClaudeGUI</span>
        <span className="text-xs text-muted-foreground">v0.5.0</span>
        <button
          type="button"
          onClick={onOpenProjectPicker}
          className="ml-2 flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs font-mono hover:bg-accent"
          aria-label="Open project"
          title={activeRoot ?? 'Open project'}
        >
          <FolderOpen className="h-3 w-3" aria-hidden="true" />
          <span className="max-w-[200px] truncate">{basename(activeRoot)}</span>
        </button>
        <AuthBadge onRequestLogin={onOpenLoginPrompt} />
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanelByType('fileExplorer')}
          aria-label="Toggle sidebar"
          title="Toggle sidebar (⌃⌘B)"
        >
          <Sidebar className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanelByType('editor')}
          aria-label="Toggle editor"
          title="Toggle editor (⌃⌘E)"
        >
          <Code2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            void terminalApi.openNative(activeRoot ?? undefined).catch(() => {
              /* ignore — user will see the OS error */
            });
          }}
          aria-label="Open external terminal"
          title="Open external terminal (⇧⌘O)"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanelByType('claude')}
          aria-label="Toggle Claude chat"
          title="Toggle Claude chat (⌃⌘K)"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanelByType('preview')}
          aria-label="Toggle preview"
          title="Toggle preview (⌃⌘P)"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={openMcpModal}
          aria-label="MCP servers"
          title={enabledMcpCount > 0 ? `MCP: ${enabledMcpCount} server(s)` : 'MCP Servers'}
        >
          <Blocks className={`h-4 w-4 ${enabledMcpCount > 0 ? 'text-blue-500' : ''}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={openRemoteModal}
          aria-label="Remote access settings"
          title={remoteAccess
            ? `원격 접근: 켜짐 (${localIPs[0] ?? '0.0.0.0'})`
            : '원격 접근: 꺼��'}
        >
          <Globe className={`h-4 w-4 ${remoteAccess ? 'text-green-500' : ''}`} />
        </Button>
        <SettingsPopover />
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
