'use client';

import { useEffect, useState } from 'react';
import { Copy, Check, RefreshCw, Globe, Loader2, AlertTriangle, Shield } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRemoteAccessStore } from '@/stores/use-remote-access-store';

interface RemoteAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RemoteAccessModal({ open, onOpenChange }: RemoteAccessModalProps) {
  const {
    remoteAccess, token, port, localIPs,
    loading, restarting,
    fetchConfig, fetchStatus, updateConfig, restartServer,
  } = useRemoteAccessStore();

  const [pendingRemote, setPendingRemote] = useState(remoteAccess);
  const [pendingToken, setPendingToken] = useState(token);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      fetchConfig();
      fetchStatus();
    }
  }, [open, fetchConfig, fetchStatus]);

  useEffect(() => {
    setPendingRemote(remoteAccess);
    setPendingToken(token);
  }, [remoteAccess, token]);

  const hasChanges = pendingRemote !== remoteAccess || pendingToken !== token;

  const copyToken = async () => {
    if (!pendingToken) return;
    try {
      await navigator.clipboard.writeText(pendingToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const handleGenerateToken = async () => {
    // Use crypto.randomUUID on client for instant feedback
    const newToken = crypto.randomUUID();
    setPendingToken(newToken);
  };

  const handleApply = async () => {
    await updateConfig(pendingRemote, {
      token: pendingRemote ? pendingToken : null,
      generateToken: pendingRemote && !pendingToken,
    });
    const ok = await restartServer();
    if (ok) {
      onOpenChange(false);
    }
  };

  const handleToggle = () => {
    const next = !pendingRemote;
    setPendingRemote(next);
    if (next && !pendingToken) {
      setPendingToken(crypto.randomUUID());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            원격 접근 설정
          </DialogTitle>
          <DialogDescription>
            원격 접근을 활성화하면 같은 네트워크의 다른 기기에서 ClaudeGUI에 접속할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">원격 접근</div>
              <div className="text-xs text-muted-foreground">
                {pendingRemote ? '0.0.0.0 (모든 인터페이스)' : '127.0.0.1 (로컬 전용)'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={pendingRemote}
              onClick={handleToggle}
              disabled={loading || restarting}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                pendingRemote ? 'bg-green-600' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  pendingRemote ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Security warning */}
          {pendingRemote && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-500" />
              <div className="text-xs text-yellow-700 dark:text-yellow-300">
                <strong>보안 경고:</strong> 원격 접근 활성화 시 네트워크의 모든 기기에서 이 서버에 접속할 수 있습니다.
                토큰 인증을 반드시 사용하세요. 프로덕션 환경에서는 SSH 터널 또는 VPN 사용을 권장합니다.
              </div>
            </div>
          )}

          {/* Token */}
          {pendingRemote && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">접근 토큰</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs font-mono">
                  {pendingToken || '(토큰 없음)'}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={copyToken}
                  disabled={!pendingToken}
                  title="토큰 복사"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleGenerateToken}
                  title="토큰 재생성"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                원격 접속 시 URL에 <code>?token=...</code> 또는 <code>Authorization: Bearer ...</code> 헤더를 사용하세요.
              </p>
            </div>
          )}

          {/* Network info */}
          {pendingRemote && localIPs.length > 0 && (
            <div className="space-y-1.5 rounded-lg border p-3">
              <div className="text-sm font-medium">네트워크 주소</div>
              <div className="space-y-1">
                {localIPs.map((ip) => (
                  <div key={ip} className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-muted-foreground">http://</span>
                    <span>{ip}:{port}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Restarting indicator */}
          {restarting && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-500/50 bg-blue-500/10 p-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-xs text-blue-700 dark:text-blue-300">
                서버를 재시작하는 중... 잠시만 기다려 주세요.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={restarting}>
            취소
          </Button>
          <Button onClick={handleApply} disabled={!hasChanges || loading || restarting}>
            {restarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                재시작 중...
              </>
            ) : (
              '적용 및 재시작'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
