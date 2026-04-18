'use client';

import { useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useClaudeStore } from '@/stores/use-claude-store';
import { getClaudeClient } from '@/lib/websocket/claude-client';
import { cn } from '@/lib/utils';

interface ToolInputShape {
  command?: unknown;
}

function buildAllowRule(toolName: string, args: unknown): string {
  if (toolName === 'Bash') {
    const cmd =
      args && typeof args === 'object' && typeof (args as ToolInputShape).command === 'string'
        ? ((args as { command: string }).command).trim()
        : '';
    if (!cmd) return 'Bash';
    const firstToken = cmd.split(/\s+/)[0] || cmd;
    return `Bash(${firstToken}:*)`;
  }
  return toolName;
}

async function parseJsonOrThrow(res: Response, label: string): Promise<unknown> {
  // The CSRF middleware and route error paths all return JSON, but a misrouted
  // request or an outer proxy can land on an HTML error page. Detect that and
  // raise a human-readable error instead of a cryptic "Unexpected token '<'".
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!res.ok) {
      throw new Error(`${label} failed: HTTP ${res.status}`);
    }
    throw new Error(`${label} returned non-JSON response`);
  }
}

async function persistAllowRule(rule: string): Promise<void> {
  const { getBrowserId } = await import('@/lib/browser-session');
  const browserId = getBrowserId();

  const getRes = await fetch('/api/settings', {
    headers: { 'x-browser-id': browserId },
  });
  const getJson = (await parseJsonOrThrow(getRes, 'Load settings')) as {
    success?: boolean;
    data?: { settings?: { permissions?: { allow?: string[]; deny?: string[] } } };
    error?: string;
  };
  if (!getJson?.success) {
    throw new Error(getJson?.error ?? 'Failed to load settings');
  }
  const settings = (getJson.data?.settings ?? {}) as {
    permissions?: { allow?: string[]; deny?: string[] };
  };
  const allow = new Set(settings.permissions?.allow ?? []);
  allow.add(rule);
  const next = {
    ...settings,
    permissions: {
      ...(settings.permissions ?? {}),
      allow: Array.from(allow),
    },
  };
  const putRes = await fetch('/api/settings', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      // Required by the CSRF middleware for POST/PUT/DELETE; missing this
      // header causes a 403 that looks like a plain HTTP error to the caller.
      'x-browser-id': browserId,
    },
    body: JSON.stringify(next),
  });
  const putJson = (await parseJsonOrThrow(putRes, 'Save settings')) as {
    success?: boolean;
    error?: string;
  };
  if (!putJson?.success) {
    throw new Error(putJson?.error ?? 'Failed to save settings');
  }
}

export function PermissionRequestModal() {
  const pending = useClaudeStore((s) => s.pendingPermission);
  const [savingRule, setSavingRule] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  if (!pending) return null;

  const rule = buildAllowRule(pending.tool, pending.args);
  const isDanger = pending.danger === 'danger';

  const handleDeny = () => {
    setRuleError(null);
    getClaudeClient().respondToPermission(pending.requestId, false);
  };

  const handleAllowOnce = () => {
    setRuleError(null);
    getClaudeClient().respondToPermission(pending.requestId, true);
  };

  const handleAlwaysAllow = async () => {
    setRuleError(null);
    setSavingRule(true);
    try {
      await persistAllowRule(rule);
      getClaudeClient().respondToPermission(pending.requestId, true);
    } catch (err) {
      setRuleError((err as Error).message);
    } finally {
      setSavingRule(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && handleDeny()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDanger ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-primary" />
            )}
            Permission Request
          </DialogTitle>
          <DialogDescription>
            Claude wants to use the <strong>{pending.tool}</strong> tool.
            {isDanger && (
              <span className="mt-2 block font-semibold text-destructive">
                ⚠ This action has been flagged as potentially dangerous.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <pre
          className={cn(
            'max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs',
            isDanger && 'border-destructive',
          )}
        >
          {JSON.stringify(pending.args, null, 2)}
        </pre>
        <div className="rounded-md border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Allow Once</span> grants this single
            call. <span className="font-medium text-foreground">Always Allow</span> saves a rule
            to <code>.claude/settings.json</code> so this tool is accepted without asking.
          </div>
          <div className="mt-1">
            Rule to be saved:{' '}
            <code className="rounded bg-muted px-1 py-0.5">{rule}</code>
          </div>
          {ruleError && (
            <div className="mt-1 text-destructive">Failed to save rule: {ruleError}</div>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-end">
          <Button variant="outline" onClick={handleDeny} disabled={savingRule}>
            Deny
          </Button>
          <Button
            variant={isDanger ? 'destructive' : 'default'}
            onClick={handleAllowOnce}
            disabled={savingRule}
          >
            Allow Once
          </Button>
          <Button
            variant="secondary"
            onClick={handleAlwaysAllow}
            disabled={savingRule || isDanger}
            title={isDanger ? 'Dangerous actions cannot be added as always-allow rules' : undefined}
          >
            {savingRule ? 'Saving…' : 'Always Allow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
