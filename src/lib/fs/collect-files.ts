/**
 * Shared utilities for extracting files from drag-and-drop DataTransfer objects.
 * Used by both File Explorer panel and Claude Chat panel.
 */

export function collectFilesFromDataTransfer(dt: DataTransfer): File[] {
  const files: File[] = [];
  if (dt.items && dt.items.length > 0) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) return files;
  }
  if (dt.files && dt.files.length > 0) {
    return Array.from(dt.files);
  }
  return files;
}

export function hasFilePayload(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  const types = dt.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i += 1) {
    if (types[i] === 'Files') return true;
  }
  return false;
}
