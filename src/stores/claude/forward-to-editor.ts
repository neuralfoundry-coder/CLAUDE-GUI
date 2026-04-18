import { applyEditOps } from '@/lib/claude/artifact-from-tool';
import { useEditorStore } from '@/stores/use-editor-store';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';
import { FILE_EDIT_TOOLS } from './helpers';

const PREVIEWABLE_EXTS = new Set(['html', 'htm', 'svg', 'md', 'markdown']);

/**
 * Route a tool_use (Write / Edit / MultiEdit) into the editor panel.
 *
 * - 'streaming' uses `updateStreamingEdit` for rAF-friendly incremental diffs
 *   while partial JSON is still accumulating.
 * - 'final' uses `applyClaudeEdit` once the block_stop arrives with a parsed
 *   tool input.
 *
 * The panel is auto-expanded if collapsed, and previewable extensions also
 * expand the preview panel.
 */
export async function forwardToolToEditor(
  tool: { name: string; input: unknown },
  mode: 'streaming' | 'final',
): Promise<void> {
  if (!FILE_EDIT_TOOLS.has(tool.name)) return;
  const input = tool.input as Record<string, unknown> | null;
  if (!input) return;
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) return;

  const editorStore = useEditorStore.getState();
  const { isPanelCollapsed, setPanelCollapsedByType } = useSplitLayoutStore.getState();

  if (isPanelCollapsed('editor')) {
    setPanelCollapsedByType('editor', false);
  }

  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (PREVIEWABLE_EXTS.has(ext) && isPanelCollapsed('preview')) {
    setPanelCollapsedByType('preview', false);
  }

  const existingTab = editorStore.tabs.find((t) => t.path === filePath);
  if (!existingTab) {
    await editorStore.openFile(filePath);
  }

  let modified: string | undefined;
  if (tool.name === 'Write') {
    modified = typeof input.content === 'string' ? input.content : undefined;
  } else {
    const tab = useEditorStore.getState().tabs.find((t) => t.path === filePath);
    const baseline = tab?.diff?.original ?? tab?.content;
    if (baseline) {
      const ops: Array<{ oldString: string; newString: string; replaceAll: boolean }> = [];
      if (typeof input.old_string === 'string' && typeof input.new_string === 'string') {
        ops.push({
          oldString: input.old_string,
          newString: input.new_string as string,
          replaceAll: input.replace_all === true,
        });
      }
      if (Array.isArray(input.edits)) {
        for (const entry of input.edits) {
          if (!entry || typeof entry !== 'object') continue;
          const obj = entry as Record<string, unknown>;
          if (typeof obj.old_string !== 'string' || typeof obj.new_string !== 'string') continue;
          ops.push({ oldString: obj.old_string, newString: obj.new_string, replaceAll: obj.replace_all === true });
        }
      }
      modified = applyEditOps(baseline, ops);
    }
  }

  if (modified === undefined) return;

  if (mode === 'streaming') {
    useEditorStore.getState().updateStreamingEdit(filePath, modified);
  } else {
    useEditorStore.getState().applyClaudeEdit(filePath, modified);
  }
}
