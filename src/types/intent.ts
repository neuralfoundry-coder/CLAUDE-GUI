export type IntentType = 'slides' | 'general';

export interface SlidePreferences {
  purpose: string;
  textSize: 'small' | 'medium' | 'large';
  colorTone: string;
  additionalNotes?: string;
}

export interface DetectedIntent {
  type: IntentType;
  preferences?: SlidePreferences;
}
