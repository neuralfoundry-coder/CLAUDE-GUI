'use client';

import { FolderTree, Code2, MessageSquare, Eye } from 'lucide-react';
import { useLayoutStore, type PanelId } from '@/stores/use-layout-store';
import { FileExplorerPanel } from '@/components/panels/file-explorer/file-explorer-panel';
import { EditorPanel } from '@/components/panels/editor/editor-panel';
import { ClaudeChatPanel } from '@/components/panels/claude/claude-chat-panel';
import { PreviewPanel } from '@/components/panels/preview/preview-panel';
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation';

interface TabDef {
  id: PanelId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { id: 'fileExplorer', label: 'Files', icon: FolderTree },
  { id: 'editor', label: 'Editor', icon: Code2 },
  { id: 'claude', label: 'Claude', icon: MessageSquare },
  { id: 'preview', label: 'Preview', icon: Eye },
];

const PANEL_COMPONENTS: Record<string, React.ComponentType> = {
  fileExplorer: FileExplorerPanel,
  editor: EditorPanel,
  claude: ClaudeChatPanel,
  preview: PreviewPanel,
};

export function MobileShell() {
  const activePanel = useLayoutStore((s) => s.mobileActivePanel);
  const setActivePanel = useLayoutStore((s) => s.setMobileActivePanel);
  const ActiveComponent = PANEL_COMPONENTS[activePanel] ?? EditorPanel;

  const TAB_IDS = TABS.map((t) => t.id);

  const swipeRef = useSwipeNavigation({
    onSwipeLeft: () => {
      const idx = TAB_IDS.indexOf(activePanel);
      if (idx < TAB_IDS.length - 1) setActivePanel(TAB_IDS[idx + 1]!);
    },
    onSwipeRight: () => {
      const idx = TAB_IDS.indexOf(activePanel);
      if (idx > 0) setActivePanel(TAB_IDS[idx - 1]!);
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div ref={swipeRef} className="flex-1 overflow-hidden">
        <ActiveComponent />
      </div>
      <nav
        className="flex h-12 shrink-0 items-center border-t glass-surface"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        role="tablist"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activePanel === id}
            onClick={() => setActivePanel(id)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] py-1 text-[10px] transition-colors ${
              activePanel === id
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
