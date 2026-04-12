'use client';

import { Settings, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useSettingsStore } from '@/stores/use-settings-store';

function ToggleItem({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onToggle(); }}>
      <span>{label}</span>
      {checked && <Check className="h-3.5 w-3.5" />}
    </DropdownMenuItem>
  );
}

function SelectItem({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string | number;
  options: { label: string; value: string | number }[];
  onSelect: (value: string | number) => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        const idx = options.findIndex((o) => o.value === value);
        const next = options[(idx + 1) % options.length]!;
        onSelect(next.value);
      }}
    >
      <span>{label}</span>
      <span className="text-[10px] text-muted-foreground">
        {options.find((o) => o.value === value)?.label ?? String(value)}
      </span>
    </DropdownMenuItem>
  );
}

export function EditorSettingsDropdown() {
  const wordWrap = useSettingsStore((s) => s.editorWordWrap);
  const tabSize = useSettingsStore((s) => s.editorTabSize);
  const useSpaces = useSettingsStore((s) => s.editorUseSpaces);
  const minimap = useSettingsStore((s) => s.editorMinimapEnabled);
  const whitespace = useSettingsStore((s) => s.editorRenderWhitespace);
  const stickyScroll = useSettingsStore((s) => s.editorStickyScroll);
  const bracketColors = useSettingsStore((s) => s.editorBracketColors);
  const completion = useSettingsStore((s) => s.editorCompletionEnabled);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded p-0.5 hover:bg-accent"
          aria-label="Editor settings"
        >
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <SelectItem
          label="Tab Size"
          value={tabSize}
          options={[
            { label: '2', value: 2 },
            { label: '4', value: 4 },
            { label: '8', value: 8 },
          ]}
          onSelect={(v) => useSettingsStore.getState().setEditorTabSize(v as number)}
        />
        <ToggleItem
          label="Spaces for Tabs"
          checked={useSpaces}
          onToggle={() => useSettingsStore.getState().setEditorUseSpaces(!useSpaces)}
        />
        <DropdownMenuSeparator />
        <ToggleItem
          label="Word Wrap"
          checked={wordWrap}
          onToggle={() => useSettingsStore.getState().setEditorWordWrap(!wordWrap)}
        />
        <ToggleItem
          label="Minimap"
          checked={minimap}
          onToggle={() => useSettingsStore.getState().setEditorMinimapEnabled(!minimap)}
        />
        <ToggleItem
          label="Sticky Scroll"
          checked={stickyScroll}
          onToggle={() => useSettingsStore.getState().setEditorStickyScroll(!stickyScroll)}
        />
        <ToggleItem
          label="Bracket Colors"
          checked={bracketColors}
          onToggle={() => useSettingsStore.getState().setEditorBracketColors(!bracketColors)}
        />
        <SelectItem
          label="Whitespace"
          value={whitespace}
          options={[
            { label: 'None', value: 'none' },
            { label: 'Boundary', value: 'boundary' },
            { label: 'All', value: 'all' },
          ]}
          onSelect={(v) =>
            useSettingsStore.getState().setEditorRenderWhitespace(v as 'none' | 'boundary' | 'all')
          }
        />
        <DropdownMenuSeparator />
        <ToggleItem
          label="AI Completion"
          checked={completion}
          onToggle={() => useSettingsStore.getState().setEditorCompletionEnabled(!completion)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
