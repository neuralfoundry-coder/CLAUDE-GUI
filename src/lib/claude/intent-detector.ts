import type { IntentType } from '@/types/intent';

const SLIDE_KEYWORDS = [
  '슬라이드',
  '프레젠테이션',
  'ppt',
  'pptx',
  '발표\\s*자료',
  '발표\\s*슬라이드',
  'presentation',
  'slides',
  'slide\\s*deck',
];

const SLIDE_PATTERN = new RegExp(
  SLIDE_KEYWORDS.map((kw) => `(?:${kw})`).join('|'),
  'i',
);

export function detectIntent(prompt: string): IntentType {
  if (SLIDE_PATTERN.test(prompt)) return 'slides';
  return 'general';
}
