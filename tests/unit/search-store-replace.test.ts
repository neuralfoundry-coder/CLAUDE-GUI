import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('@/lib/browser-session', () => ({
  getBrowserId: () => 'test-browser',
}));

import { useSearchStore } from '@/stores/use-search-store';

function primeResults(files: string[]) {
  useSearchStore.setState({
    query: 'foo',
    caseSensitive: true,
    results: files.map((file) => ({ file, line: 1, text: 'foo here' })),
  });
}

describe('useSearchStore — replace actions', () => {
  beforeEach(() => {
    useSearchStore.setState({
      open: false,
      query: '',
      results: [],
      loading: false,
      truncated: false,
      caseSensitive: true,
      glob: '',
      replaceMode: false,
      replacement: '',
      replaceLoading: false,
      replacePreview: null,
      replaceError: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('setReplaceMode(true) enters replace mode and clears any stale preview', () => {
    useSearchStore.setState({
      replacePreview: {
        dryRun: true,
        totalReplacements: 1,
        filesChanged: 1,
        filesScanned: 1,
        results: [],
      },
      replaceError: 'old',
    });
    useSearchStore.getState().setReplaceMode(true);
    const s = useSearchStore.getState();
    expect(s.replaceMode).toBe(true);
    expect(s.replacePreview).toBeNull();
    expect(s.replaceError).toBeNull();
  });

  it('setReplacement updates the value and drops any stale preview', () => {
    useSearchStore.setState({
      replacePreview: {
        dryRun: true,
        totalReplacements: 1,
        filesChanged: 1,
        filesScanned: 1,
        results: [],
      },
    });
    useSearchStore.getState().setReplacement('BAR');
    expect(useSearchStore.getState().replacement).toBe('BAR');
    expect(useSearchStore.getState().replacePreview).toBeNull();
  });

  it('previewReplace POSTs dry-run with unique files from results and stores the summary', async () => {
    primeResults(['a.ts', 'b.ts', 'a.ts']); // duplicate path
    useSearchStore.setState({ replacement: 'bar' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            dryRun: true,
            totalReplacements: 3,
            filesChanged: 2,
            filesScanned: 2,
            results: [
              { path: 'a.ts', replacements: 2, status: 'ok' },
              { path: 'b.ts', replacements: 1, status: 'ok' },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await useSearchStore.getState().previewReplace();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/files/replace');
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({
      query: 'foo',
      replace: 'bar',
      caseSensitive: true,
      dryRun: true,
    });
    // Duplicates collapsed to unique files.
    expect(body.files.sort()).toEqual(['a.ts', 'b.ts']);
    expect(useSearchStore.getState().replacePreview?.totalReplacements).toBe(3);
    expect(useSearchStore.getState().replaceLoading).toBe(false);
  });

  it('previewReplace is a no-op when there are no results', async () => {
    useSearchStore.setState({ query: 'foo', results: [], replacement: 'bar' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await useSearchStore.getState().previewReplace();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applyReplace writes only to files that had replacements in the dry-run', async () => {
    useSearchStore.setState({
      query: 'foo',
      replacement: 'bar',
      caseSensitive: false,
      replacePreview: {
        dryRun: true,
        totalReplacements: 3,
        filesChanged: 1,
        filesScanned: 3,
        results: [
          { path: 'a.ts', replacements: 3, status: 'ok' },
          { path: 'b.ts', replacements: 0, status: 'skipped' },
          { path: 'c.ts', replacements: 0, status: 'error', error: 'not found' },
        ],
      },
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      // First call: apply. Second call: search rerun.
      if (init && (init as RequestInit).method === 'POST') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              dryRun: false,
              totalReplacements: 3,
              filesChanged: 1,
              filesScanned: 1,
              results: [{ path: 'a.ts', replacements: 3, status: 'ok' }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ success: true, data: { matches: [], truncated: false } }));
    });

    await useSearchStore.getState().applyReplace();

    const applyCall = fetchMock.mock.calls.find(
      ([, init]) => init && (init as RequestInit).method === 'POST',
    );
    expect(applyCall).toBeDefined();
    const body = JSON.parse(String((applyCall![1] as RequestInit).body));
    expect(body.dryRun).toBe(false);
    expect(body.files).toEqual(['a.ts']);
    // Preview switches to the "applied" response.
    expect(useSearchStore.getState().replacePreview?.dryRun).toBe(false);
  });

  it('applyReplace is a no-op when there is no preview', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await useSearchStore.getState().applyReplace();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clearReplacePreview drops the preview and error', () => {
    useSearchStore.setState({
      replacePreview: {
        dryRun: true,
        totalReplacements: 1,
        filesChanged: 1,
        filesScanned: 1,
        results: [],
      },
      replaceError: 'boom',
    });
    useSearchStore.getState().clearReplacePreview();
    const s = useSearchStore.getState();
    expect(s.replacePreview).toBeNull();
    expect(s.replaceError).toBeNull();
  });
});
