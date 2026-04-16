/**
 * Monaco Editor loader configuration.
 *
 * By default, Monaco loads from the jsDelivr CDN (the @monaco-editor/react
 * default). Set `NEXT_PUBLIC_MONACO_LOCAL=true` to load from a local copy
 * at `/monaco-editor/min/vs` instead.
 *
 * To serve Monaco locally:
 *   cp -r node_modules/monaco-editor/min public/monaco-editor/min
 *
 * This is useful for offline environments or slow connections.
 */
import { loader } from '@monaco-editor/react';

const useLocal = process.env.NEXT_PUBLIC_MONACO_LOCAL === 'true';

export function configureMonacoLoader(): void {
  if (useLocal) {
    loader.config({
      paths: { vs: '/monaco-editor/min/vs' },
    });
  }
  // When useLocal is false, the default CDN loader is used (no config needed).
}
