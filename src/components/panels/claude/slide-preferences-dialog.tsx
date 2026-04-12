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
import type { SlidePreferences } from '@/types/intent';

const PURPOSE_PRESETS = [
  { label: '사내 보고', value: '사내 보고' },
  { label: '학회 발표', value: '학회 발표' },
  { label: '수업 자료', value: '수업 자료' },
  { label: '투자 제안', value: '투자 제안' },
] as const;

const TEXT_SIZE_OPTIONS = [
  { label: '작게', value: 'small' as const, desc: '정보 밀도 높음' },
  { label: '보통', value: 'medium' as const, desc: '균형 잡힌 크기' },
  { label: '크게', value: 'large' as const, desc: '가독성 우선' },
] as const;

const COLOR_TONE_PRESETS = [
  { label: 'Deep Navy', value: 'deep-navy', color: '#1B2A4A' },
  { label: 'Corporate Blue', value: 'corporate-blue', color: '#2563EB' },
  { label: 'Warm', value: 'warm', color: '#D97706' },
  { label: 'Minimal', value: 'minimal', color: '#6B7280' },
  { label: 'Dark', value: 'dark', color: '#1F2937' },
  { label: 'Forest', value: 'forest', color: '#065F46' },
] as const;

export interface SlidePreferencesDialogProps {
  open: boolean;
  onSubmit: (preferences: SlidePreferences) => void;
  onSkip: () => void;
  onCancel: () => void;
}

export function SlidePreferencesDialog({
  open,
  onSubmit,
  onSkip,
  onCancel,
}: SlidePreferencesDialogProps): React.ReactElement {
  const [purpose, setPurpose] = useState('');
  const [customPurpose, setCustomPurpose] = useState('');
  const [textSize, setTextSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [colorTone, setColorTone] = useState('deep-navy');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const resolvedPurpose = purpose === '__custom__' ? customPurpose : purpose;

  const handleSubmit = () => {
    onSubmit({
      purpose: resolvedPurpose || '일반',
      textSize,
      colorTone,
      ...(additionalNotes.trim() ? { additionalNotes: additionalNotes.trim() } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>슬라이드 설정</DialogTitle>
          <DialogDescription>
            더 나은 프레젠테이션을 위해 몇 가지 사항을 확인합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Purpose */}
          <div className="space-y-2">
            <label className="text-sm font-medium">용도</label>
            <div className="flex flex-wrap gap-2">
              {PURPOSE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPurpose(p.value)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    purpose === p.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPurpose('__custom__')}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  purpose === '__custom__'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:bg-accent'
                }`}
              >
                기타
              </button>
            </div>
            {purpose === '__custom__' && (
              <input
                type="text"
                placeholder="용도를 입력하세요"
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            )}
          </div>

          {/* Text Size */}
          <div className="space-y-2">
            <label className="text-sm font-medium">텍스트 크기</label>
            <div className="flex gap-2">
              {TEXT_SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTextSize(opt.value)}
                  className={`flex-1 rounded-md border px-3 py-2 text-center text-xs transition-colors ${
                    textSize === opt.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className={`mt-0.5 ${textSize === opt.value ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Color Tone */}
          <div className="space-y-2">
            <label className="text-sm font-medium">컬러톤</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_TONE_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColorTone(c.value)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                    colorTone === c.value
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Additional Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">추가 요청 (선택)</label>
            <textarea
              placeholder="예: 10장 이내로, 영어로 작성, 특정 템플릿 스타일 등"
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            기본 설정으로 생성
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            생성하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
