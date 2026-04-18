'use client';

import { useState } from 'react';
import { Layout, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLayoutPresetsStore } from '@/stores/use-layout-presets-store';

export function LayoutPresetsMenu() {
  const [open, setOpen] = useState(false);
  const applyPreset = useLayoutPresetsStore((s) => s.applyPreset);
  const savePreset = useLayoutPresetsStore((s) => s.savePreset);
  const deletePreset = useLayoutPresetsStore((s) => s.deletePreset);
  // Subscribe to userPresets so the menu re-renders when presets change.
  const userPresets = useLayoutPresetsStore((s) => s.userPresets);

  const handleSave = () => {
    const name = window.prompt('Name this layout preset', 'My layout');
    if (name === null) return;
    savePreset(name);
    setOpen(false);
  };

  const allPresets = useLayoutPresetsStore.getState().listAllPresets();
  // Recompute using current userPresets subscription so the menu reflects deletions.
  const presetsView = [
    ...allPresets.filter((p) => p.builtin),
    ...Object.values(userPresets).sort((a, b) => a.name.localeCompare(b.name)),
  ];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Layout presets"
          title="Layout presets"
        >
          <Layout className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {presetsView.map((preset) => (
          <DropdownMenuItem
            key={preset.id}
            onSelect={(e) => {
              e.preventDefault();
              applyPreset(preset.id);
              setOpen(false);
            }}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate">{preset.name}</span>
            {!preset.builtin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deletePreset(preset.id);
                }}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Delete preset ${preset.name}`}
                title="Delete preset"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleSave(); }}>
          <Save className="mr-2 h-3.5 w-3.5" />
          Save current layout…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
