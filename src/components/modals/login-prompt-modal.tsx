'use client';

import { useState } from 'react';
import { Terminal as TerminalIcon, Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLayoutStore } from '@/stores/use-layout-store';
import { useAuthStore } from '@/stores/use-auth-store';
import { useTerminalStore } from '@/stores/use-terminal-store';

interface LoginPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LOGIN_COMMAND = 'claude login';
const INSTALL_COMMAND = 'npm install -g @anthropic-ai/claude-code';

export function LoginPromptModal({ open, onOpenChange }: LoginPromptModalProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const status = useAuthStore((s) => s.status);
  const refresh = useAuthStore((s) => s.refresh);
  const setCollapsed = useLayoutStore((s) => s.setCollapsed);
  const sessions = useTerminalStore((s) => s.sessions);
  const createSession = useTerminalStore((s) => s.createSession);

  const cliMissing = status?.cliInstalled === false;

  const copy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const openTerminal = () => {
    setCollapsed('terminal', false);
    if (sessions.length === 0) {
      createSession();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TerminalIcon className="h-5 w-5" aria-hidden="true" />
            {cliMissing ? 'Install Claude CLI' : 'Sign in to Claude'}
          </DialogTitle>
          <DialogDescription>
            {cliMissing
              ? 'The Claude CLI is not installed. Run this command in any terminal — ClaudeGUI will detect it automatically.'
              : 'Run the login command in the built-in terminal. ClaudeGUI will detect your credentials automatically.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {cliMissing && (
            <CommandRow
              command={INSTALL_COMMAND}
              copied={copied === INSTALL_COMMAND}
              onCopy={() => copy(INSTALL_COMMAND)}
            />
          )}
          <CommandRow
            command={LOGIN_COMMAND}
            copied={copied === LOGIN_COMMAND}
            onCopy={() => copy(LOGIN_COMMAND)}
          />
          <p className="text-xs text-muted-foreground">
            ClaudeGUI inherits your HOME and PATH, so `claude login` writes credentials exactly
            like a standalone terminal.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => void refresh()}>
            Re-check
          </Button>
          <Button onClick={openTerminal}>Open terminal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CommandRowProps {
  command: string;
  copied: boolean;
  onCopy: () => void;
}

function CommandRow({ command, copied, onCopy }: CommandRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted px-3 py-2">
      <code className="text-sm font-mono">{command}</code>
      <Button
        variant="ghost"
        size="icon"
        onClick={onCopy}
        aria-label={`Copy ${command}`}
        title="Copy"
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}
