'use client';

import { useState } from 'react';
import { Terminal as TerminalIcon, Copy, Check, Key } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';
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
  const [activeTab, setActiveTab] = useState<'cli' | 'apikey'>('cli');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const status = useAuthStore((s) => s.status);
  const refresh = useAuthStore((s) => s.refresh);
  const setPanelCollapsedByType = useSplitLayoutStore((s) => s.setPanelCollapsedByType);
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
    setPanelCollapsedByType('terminal', false);
    if (sessions.length === 0) {
      createSession();
    }
    onOpenChange(false);
  };

  const handleSaveApiKey = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/auth/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const body = (await res.json()) as { success: boolean; error?: string };
      if (!body.success) throw new Error(body.error ?? 'Failed to save');
      setApiKey('');
      await refresh();
      onOpenChange(false);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveApiKey = async () => {
    try {
      await fetch('/api/auth/api-key', { method: 'DELETE' });
      await refresh();
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {activeTab === 'cli' ? (
              <TerminalIcon className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Key className="h-5 w-5" aria-hidden="true" />
            )}
            {cliMissing
              ? 'Install Claude CLI'
              : activeTab === 'cli'
                ? 'Sign in to Claude'
                : 'API Key Authentication'}
          </DialogTitle>
          <DialogDescription>
            {cliMissing
              ? 'The Claude CLI is not installed. Run this command in any terminal — ClaudeGUI will detect it automatically.'
              : activeTab === 'cli'
                ? 'Run the login command in the built-in terminal. ClaudeGUI will detect your credentials automatically.'
                : 'Enter your Anthropic API key. It will be stored securely on the server.'}
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher */}
        {!cliMissing && (
          <div className="flex gap-1 rounded-md border bg-muted p-0.5">
            <button
              type="button"
              className={`flex-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === 'cli'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('cli')}
            >
              CLI Login
            </button>
            <button
              type="button"
              className={`flex-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === 'apikey'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('apikey')}
            >
              API Key
            </button>
          </div>
        )}

        {/* CLI tab */}
        {activeTab === 'cli' && (
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
        )}

        {/* API Key tab */}
        {activeTab === 'apikey' && (
          <div className="space-y-3">
            {status?.hasApiKeySaved && (
              <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                <p className="text-sm text-muted-foreground">
                  API key is saved.
                </p>
                <Button variant="ghost" size="sm" onClick={handleRemoveApiKey} className="text-red-500 hover:text-red-600 hover:bg-red-500/10">
                  Remove
                </Button>
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="api-key-input" className="text-sm font-medium">
                Anthropic API Key
              </label>
              <input
                id="api-key-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                autoComplete="off"
              />
            </div>
            {saveError && <p className="text-xs text-red-500">{saveError}</p>}
            <p className="text-xs text-muted-foreground">
              The key is stored server-side only and never sent to the browser.
            </p>
          </div>
        )}

        <DialogFooter>
          {activeTab === 'cli' && (
            <>
              <Button variant="outline" onClick={() => void refresh()}>
                Re-check
              </Button>
              <Button onClick={openTerminal}>Open terminal</Button>
            </>
          )}
          {activeTab === 'apikey' && (
            <Button onClick={handleSaveApiKey} disabled={saving || !apiKey.trim()}>
              {saving ? 'Saving...' : 'Save API Key'}
            </Button>
          )}
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
