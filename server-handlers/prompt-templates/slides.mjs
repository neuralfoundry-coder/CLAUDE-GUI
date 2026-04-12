const TEXT_SIZE_MAP = {
  small: 'Use smaller font sizes to maximize information density per slide. Prioritize fitting more content while maintaining readability.',
  medium: 'Use balanced font sizes — large enough for readability, compact enough to include meaningful content on each slide.',
  large: 'Use large, highly readable font sizes. Prioritize clarity and visual impact over information density.',
};

const COLOR_TONE_MAP = {
  'deep-navy': { primary: 'Deep Navy (#1B2A4A)', accent: 'Electric Blue (#3B82F6)', background: 'White/Light Gray' },
  'corporate-blue': { primary: 'Corporate Blue (#2563EB)', accent: 'Amber (#F59E0B)', background: 'White' },
  'warm': { primary: 'Warm Amber (#D97706)', accent: 'Terracotta (#C2410C)', background: 'Cream/Warm White' },
  'minimal': { primary: 'Slate Grey (#6B7280)', accent: 'Indigo (#6366F1)', background: 'White' },
  'dark': { primary: 'Dark Grey (#1F2937)', accent: 'Cyan (#06B6D4)', background: 'Near-Black (#111827)' },
  'forest': { primary: 'Forest Green (#065F46)', accent: 'Gold (#CA8A04)', background: 'White/Light Sage' },
};

/**
 * Build an augmented prompt for slide/presentation generation.
 * The returned string replaces the user's raw prompt when sent to the SDK.
 */
export function buildSlidePrompt(userPrompt, preferences = {}) {
  const {
    purpose = '일반',
    textSize = 'medium',
    colorTone = 'deep-navy',
    additionalNotes,
  } = preferences;

  const textGuidance = TEXT_SIZE_MAP[textSize] || TEXT_SIZE_MAP.medium;
  const colors = COLOR_TONE_MAP[colorTone] || COLOR_TONE_MAP['deep-navy'];

  return `Create a professional business presentation based on the user's request below.

## Output Format
- Unless the user explicitly requests a different format (e.g., PPTX, PDF), **always produce an HTML file using reveal.js**.
- Use reveal.js CDN (https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/) for all assets.
- Each slide is a \`<section>\` element inside \`<div class="reveal"><div class="slides">...</div></div>\`.
- Include inline \`<style>\` for custom colors, fonts, and layout — do not rely on external CSS beyond the reveal.js theme.
- The HTML file must be self-contained and renderable when opened directly in a browser or in ClaudeGUI's preview panel.

Follow these strict design and content guidelines for high visibility and consistency:

## Visual Consistency
- Use a cohesive color palette: Primary — ${colors.primary}, Accent — ${colors.accent}, Background — ${colors.background}.
- Use clean, modern sans-serif fonts (like Inter, Montserrat, or Roboto) for all text.
- ${textGuidance}

## Slide Layout
- Implement a minimalist 'Z-pattern' layout to guide the viewer's eye.
- Ensure a 60/40 balance between visual elements and text — avoid heavy text blocks.
- Use clear headings and subheadings for every slide.

## Diverse Visual Elements
Instead of bullet points, use a variety of:
- High-quality professional icons (flat or line art style).
- Clean data visualizations (bar charts, donut charts, or trend lines) where appropriate.
- Process diagrams (chevrons, cycles, or flowcharts) for workflows.
- High-resolution, context-relevant imagery with appropriate overlays for text readability.

## Tone & Style
- Maintain a formal yet persuasive business tone.
- Use 'Action Titles' that convey insight (e.g., 'Market Share is Growing' instead of just 'Market Share').
- Purpose/audience: ${purpose}

${additionalNotes ? `## Additional Requirements\n${additionalNotes}\n` : ''}## User Request
${userPrompt}`;
}
