'use client';

import { Settings, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
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

export function SettingsPopover() {
  const panelRounding = useSettingsStore((s) => s.panelRounding);
  const liquidGlass = useSettingsStore((s) => s.liquidGlass);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Design settings"
          title="Design settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <ToggleItem
          label="Panel Rounding"
          checked={panelRounding}
          onToggle={() => useSettingsStore.getState().setPanelRounding(!panelRounding)}
        />
        <ToggleItem
          label="Liquid Glass"
          checked={liquidGlass}
          onToggle={() => useSettingsStore.getState().setLiquidGlass(!liquidGlass)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
