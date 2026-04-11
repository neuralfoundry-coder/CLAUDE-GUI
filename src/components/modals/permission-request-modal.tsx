'use client';

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

export function PermissionRequestModal() {
  const pending = useClaudeStore((s) => s.pendingPermission);

  if (!pending) return null;

  const onApprove = () => getClaudeClient().respondToPermission(pending.requestId, true);
  const onDeny = () => getClaudeClient().respondToPermission(pending.requestId, false);

  const isDanger = pending.danger === 'danger';

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onDeny()}>
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
        <DialogFooter>
          <Button variant="outline" onClick={onDeny}>
            Deny
          </Button>
          <Button variant={isDanger ? 'destructive' : 'default'} onClick={onApprove}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
