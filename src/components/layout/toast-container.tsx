'use client';

import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { useToastStore } from '@/stores/use-toast-store';
import { cn } from '@/lib/utils';

const iconMap = {
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
} as const;

const colorMap = {
  error: 'border-destructive/50 bg-destructive/10 text-destructive',
  success: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  info: 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400',
} as const;

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-12 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-xs shadow-lg backdrop-blur-sm animate-in slide-in-from-right-5 fade-in duration-200',
              colorMap[toast.type],
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[300px] truncate">{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
