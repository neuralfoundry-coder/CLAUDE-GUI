/**
 * Return a URL that serves the bytes of a captured artifact. We try the
 * session-scoped artifact registry first (`/api/artifacts/raw`) — that is
 * what keeps binary previews working after the user switches projects — and
 * fall back to the project-scoped raw endpoint for unregistered paths.
 *
 * Both endpoints accept the same `?path=` query so the previewers don't need
 * any other branching.
 */
export function artifactRawUrl(filePath: string): string {
  return `/api/artifacts/raw?path=${encodeURIComponent(filePath)}`;
}

export function projectRawUrl(filePath: string): string {
  return `/api/files/raw?path=${encodeURIComponent(filePath)}`;
}

/**
 * Fetch artifact bytes, trying the registry first and transparently falling
 * back to the project-scoped endpoint. Useful for previewers that need the
 * content once (docx/xlsx/pptx converters).
 */
export async function fetchArtifactBytes(filePath: string): Promise<ArrayBuffer> {
  const tryFetch = async (url: string): Promise<ArrayBuffer | null> => {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  };

  const viaRegistry = await tryFetch(artifactRawUrl(filePath));
  if (viaRegistry) return viaRegistry;
  const viaProject = await tryFetch(projectRawUrl(filePath));
  if (viaProject) return viaProject;
  throw new Error(`artifact not reachable: ${filePath}`);
}
