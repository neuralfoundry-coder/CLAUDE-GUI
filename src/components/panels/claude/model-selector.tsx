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

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  return `${tokens / 1_000}k`;
}

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
      <DropdownMenuContent align="start" className="min-w-[240px]">
        <DropdownMenuItem
          className="text-xs"
          onClick={() => setSelectedModel(null)}
        >
          <div className="flex flex-1 flex-col">
            <span className="font-medium">Auto</span>
            <span className="text-[10px] text-muted-foreground">default</span>
          </div>
          {selectedModel === null && <Check className="h-3 w-3 shrink-0 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {MODEL_SPECS.map((m) => (
          <DropdownMenuItem
            key={m.id}
            className="text-xs"
            onClick={() => setSelectedModel(m.id)}
          >
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span className="font-medium">{m.displayName}</span>
                <span className="text-[10px] text-muted-foreground">
                  {formatContext(m.contextWindow)} ctx
                </span>
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
              </div>
              <span className="text-[10px] text-muted-foreground">{m.description}</span>
            </div>
            {selectedModel === m.id && <Check className="h-3 w-3 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
