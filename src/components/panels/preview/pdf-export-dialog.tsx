'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type PageOrientation = 'auto' | 'portrait' | 'landscape';
export type PageSize = 'A4' | 'Letter' | 'Legal';

export interface PdfExportOptions {
  orientation: PageOrientation;
  pageSize: PageSize;
}

const ORIENTATION_OPTIONS = [
  { label: '자동 감지', value: 'auto' as const, desc: 'HTML 내 설정 존중' },
  { label: '세로', value: 'portrait' as const, desc: 'Portrait' },
  { label: '가로', value: 'landscape' as const, desc: 'Landscape' },
] as const;

const PAGE_SIZE_OPTIONS = [
  { label: 'A4', value: 'A4' as const, desc: '210 × 297 mm' },
  { label: 'Letter', value: 'Letter' as const, desc: '8.5 × 11 in' },
  { label: 'Legal', value: 'Legal' as const, desc: '8.5 × 14 in' },
] as const;

export interface PdfExportDialogProps {
  open: boolean;
  /** Hint: true when the source HTML looks like a landscape/presentation layout. */
  suggestLandscape: boolean;
  onExport: (options: PdfExportOptions) => void;
  onCancel: () => void;
}

export function PdfExportDialog({
  open,
  suggestLandscape,
  onExport,
  onCancel,
}: PdfExportDialogProps): React.ReactElement {
  const [orientation, setOrientation] = useState<PageOrientation>(
    suggestLandscape ? 'landscape' : 'auto',
  );
  const [pageSize, setPageSize] = useState<PageSize>('A4');

  const handleExport = () => {
    onExport({ orientation, pageSize });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>PDF 내보내기 설정</DialogTitle>
          <DialogDescription>
            페이지 방향과 크기를 선택합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Orientation */}
          <div className="space-y-2">
            <label className="text-sm font-medium">페이지 방향</label>
            <div className="flex gap-2">
              {ORIENTATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOrientation(opt.value)}
                  className={`flex-1 rounded-md border px-3 py-2 text-center text-xs transition-colors ${
                    orientation === opt.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className={`mt-0.5 ${orientation === opt.value ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
            {suggestLandscape && orientation === 'auto' && (
              <p className="text-[11px] text-muted-foreground">
                프레젠테이션/가로형 레이아웃이 감지되어 가로 방향으로 출력됩니다.
              </p>
            )}
          </div>

          {/* Page Size */}
          <div className="space-y-2">
            <label className="text-sm font-medium">페이지 크기</label>
            <div className="flex gap-2">
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPageSize(opt.value)}
                  className={`flex-1 rounded-md border px-3 py-2 text-center text-xs transition-colors ${
                    pageSize === opt.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className={`mt-0.5 ${pageSize === opt.value ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            취소
          </Button>
          <Button size="sm" onClick={handleExport}>
            내보내기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
