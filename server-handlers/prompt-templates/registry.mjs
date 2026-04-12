/**
 * Intent → prompt-builder registry.
 * Each entry is a lazy import returning a module with a `buildSlidePrompt`
 * (or generic `buildPrompt`) function.
 */
export const intentRegistry = {
  slides: () => import('./slides.mjs'),
  // future: report: () => import('./report.mjs'),
  // future: diagram: () => import('./diagram.mjs'),
};
