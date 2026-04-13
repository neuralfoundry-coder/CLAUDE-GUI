'use client';

import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useEditorStore } from '@/stores/use-editor-store';
import { useLayoutStore } from '@/stores/use-layout-store';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';
import { useClaudeStore } from '@/stores/use-claude-store';
import { useSettingsStore } from '@/stores/use-settings-store';
import { useMcpStore } from '@/stores/use-mcp-store';
import { filesApi } from '@/lib/api-client';
import { exportToPptx, parseHtmlToSlides } from '@/lib/export/pptx-exporter';
import { openPrintPdf } from '@/lib/export/pdf-exporter';

interface FileItem {
  path: string;
  name: string;
}

async function listAllFiles(dir = '', depth = 0): Promise<FileItem[]> {
  if (depth > 3) return [];
  try {
    const { entries } = await filesApi.list(dir);
    const out: FileItem[] = [];
    for (const e of entries) {
      const full = dir ? `${dir}/${e.name}` : e.name;
      if (e.type === 'directory') {
        const sub = await listAllFiles(full, depth + 1);
        out.push(...sub);
      } else {
        out.push({ path: full, name: e.name });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const openFile = useEditorStore((s) => s.openFile);
  const togglePanel = useSplitLayoutStore((s) => s.togglePanelByType);
  const setTheme = useLayoutStore((s) => s.setTheme);
  const resetClaude = useClaudeStore((s) => s.reset);
  const openRulesModal = useSettingsStore((s) => s.openRulesModal);
  const openMcpModal = useMcpStore((s) => s.openModal);
  const fetchMcpStatus = useMcpStore((s) => s.fetchStatus);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open && files.length === 0) {
      listAllFiles().then(setFiles);
    }
  }, [open, files.length]);

  const runCommand = (fn: () => void | Promise<void>) => {
    setOpen(false);
    Promise.resolve(fn()).catch(console.error);
  };

  const exportPptx = async () => {
    const activeTab = useEditorStore.getState().tabs.find(
      (t) => t.id === useEditorStore.getState().activeTabId,
    );
    if (!activeTab) return;
    const slides = parseHtmlToSlides(activeTab.content);
    if (slides.length === 0) {
      alert('No slides detected (expected <section> elements)');
      return;
    }
    await exportToPptx(slides);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[520px] max-w-[90vw] overflow-hidden rounded-lg border bg-popover shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command loop>
          <Command.Input
            autoFocus
            placeholder="Type a command or search..."
            className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-xs text-muted-foreground">
              No results.
            </Command.Empty>

            <Command.Group heading="Actions">
              <Command.Item
                onSelect={() => runCommand(() => togglePanel('fileExplorer'))}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                Toggle Sidebar
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => togglePanel('preview'))}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                Toggle Preview
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => setTheme('dark'))}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                Theme: Dark
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => setTheme('light'))}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                Theme: Light
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => setTheme('high-contrast'))}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                Theme: High Contrast
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => setTheme('retro-green'))}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                Theme: Retro — Green Phosphor
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => setTheme('system'))}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                Theme: System (Auto)
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => resetClaude())}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                New Claude Session
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => openRulesModal())}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                Edit Permission Rules
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => openMcpModal())}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                MCP: Manage Servers
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => fetchMcpStatus())}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                MCP: Refresh Status
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(exportPptx)}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                Export Current as PPTX
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(openPrintPdf)}
                className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
              >
                Export Slides as PDF
              </Command.Item>
            </Command.Group>

            {files.length > 0 && (
              <Command.Group heading="Files">
                {files.slice(0, 50).map((f) => (
                  <Command.Item
                    key={f.path}
                    value={f.path}
                    onSelect={() => runCommand(() => openFile(f.path))}
                    className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-accent"
                  >
                    <span className="truncate">{f.path}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
