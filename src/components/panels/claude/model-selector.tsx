'use client';

import { ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSettingsStore } from '@/stores/use-settings-store';
import { MODEL_SPECS, getModelSpec } from '@/lib/claude/model-specs';
import { cn } from '@/lib/utils';

export function ModelSelector() {
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);
  const spec = selectedModel ? getModelSpec(selectedModel) : null;
  const label = spec?.displayName ?? 'Auto';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 gap-1 px-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
        >
          {label}
          <ChevronDown className="h-2.5 w-2.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuItem
          className="text-xs"
          onClick={() => setSelectedModel(null)}
        >
          <span>Auto</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span>default</span>
            {selectedModel === null && <Check className="h-3 w-3 text-primary" />}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {MODEL_SPECS.map((m) => (
          <DropdownMenuItem
            key={m.id}
            className="text-xs"
            onClick={() => setSelectedModel(m.id)}
          >
            <span>{m.displayName}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span>{m.contextWindow / 1000}k</span>
              <span
                className={cn(
                  'text-[9px]',
                  m.inputPricePer1M >= 10
                    ? 'text-amber-500'
                    : m.inputPricePer1M >= 2
                      ? 'text-blue-500'
                      : 'text-emerald-500',
                )}
              >
                ${m.inputPricePer1M}
              </span>
              {selectedModel === m.id && <Check className="h-3 w-3 text-primary" />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
