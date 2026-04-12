'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  extractArtifacts,
  type ExtractedArtifact,
} from '@/lib/claude/artifact-extractor';
import {
  artifactFromEdit,
  artifactFromWrite,
  type ToolUseLike,
} from '@/lib/claude/artifact-from-tool';

/** Maximum artifacts kept in-memory during a session. */
const MAX_ARTIFACTS = 200;
/** Maximum artifacts persisted to localStorage (keeps the most recent). */
const MAX_PERSISTED = 30;

export type Artifact = ExtractedArtifact;

/**
 * POST the given absolute paths to the server-side artifact registry so the
 * `/api/artifacts/raw` endpoint will serve their bytes even after the user
 * switches projects. Fire-and-forget — failures are logged but never block
 * the store update.
 */
function registerArtifactPaths(paths: string[]): void {
  if (typeof window === 'undefined' || paths.length === 0) return;
  fetch('/api/artifacts/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths }),
  }).catch((err) => {
    console.warn('[artifacts] register failed', err);
  });
}

export interface ArtifactModalSize {
  width: number;
  height: number;
}

interface ArtifactState {
  artifacts: Artifact[];
  isOpen: boolean;
  autoOpen: boolean;
  highlightedId: string | null;
  pendingTurn: string[];
  modalSize: ArtifactModalSize | null;

  extractFromMessage: (
    messageId: string,
    sessionId: string | null,
    text: string,
    options?: { silent?: boolean },
  ) => string[];
  ingestToolUse: (
    messageId: string,
    sessionId: string | null,
    tool: ToolUseLike,
    options?: { silent?: boolean },
  ) => string[];
  findByFilePath: (filePath: string) => Artifact | null;
  flushPendingOpen: () => void;
  open: (highlightedId?: string | null) => void;
  close: () => void;
  toggle: () => void;
  setAutoOpen: (enabled: boolean) => void;
  setModalSize: (size: ArtifactModalSize | null) => void;
  remove: (id: string) => void;
  clear: () => void;
  clearSession: (sessionId: string | null) => void;
}

function dedupe(existing: Artifact[], incoming: Artifact[]): Artifact[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((a) => [a.id, a] as const));
  for (const next of incoming) {
    const prev = byId.get(next.id);
    // Preserve the original createdAt when an existing entry is being
    // refreshed (e.g. a follow-up Write/Edit to the same file path) — only
    // updatedAt should move forward.
    const merged: Artifact = prev
      ? { ...next, createdAt: prev.createdAt, updatedAt: next.updatedAt }
      : next;
    byId.set(next.id, merged);
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => a.createdAt - b.createdAt);
  if (merged.length > MAX_ARTIFACTS) {
    return merged.slice(merged.length - MAX_ARTIFACTS);
  }
  return merged;
}

export const useArtifactStore = create<ArtifactState>()(
  persist(
    (set, get) => ({
      artifacts: [],
      isOpen: false,
      autoOpen: true,
      highlightedId: null,
      pendingTurn: [],
      modalSize: null,

      extractFromMessage: (messageId, sessionId, text, options) => {
        const extracted = extractArtifacts(text, { messageId, sessionId });
        if (extracted.length === 0) return [];
        set((s) => ({
          artifacts: dedupe(s.artifacts, extracted),
          pendingTurn: options?.silent
            ? s.pendingTurn
            : [...s.pendingTurn, ...extracted.map((a) => a.id)],
        }));
        return extracted.map((a) => a.id);
      },

      ingestToolUse: (messageId, sessionId, tool, options) => {
        const now = Date.now();
        const name = tool?.name;
        if (name !== 'Write' && name !== 'Edit' && name !== 'MultiEdit') return [];

        const input =
          tool?.input && typeof tool.input === 'object' ? (tool.input as Record<string, unknown>) : null;
        const filePath = typeof input?.file_path === 'string' ? (input.file_path as string) : '';
        if (!filePath) return [];

        const current = get();
        const existing = current.artifacts.find((a) => a.filePath === filePath) ?? null;

        let next: Artifact | null = null;
        if (name === 'Write') {
          next = artifactFromWrite(tool, { messageId, sessionId, now });
        } else {
          next = artifactFromEdit(tool, { messageId, sessionId, now }, existing);
        }
        if (!next) return [];

        set((s) => ({
          artifacts: dedupe(s.artifacts, [next!]),
          pendingTurn: options?.silent ? s.pendingTurn : [...s.pendingTurn, next!.id],
        }));
        // Register the absolute path with the server so previewers can read
        // the bytes via /api/artifacts/raw regardless of current project.
        if (next.filePath) registerArtifactPaths([next.filePath]);
        return [next.id];
      },

      findByFilePath: (filePath) => {
        return get().artifacts.find((a) => a.filePath === filePath) ?? null;
      },

      flushPendingOpen: () => {
        const { pendingTurn, autoOpen, isOpen } = get();
        if (pendingTurn.length === 0) return;
        const highlight = pendingTurn[pendingTurn.length - 1];
        set({
          pendingTurn: [],
          highlightedId: highlight,
          isOpen: autoOpen ? true : isOpen,
        });
      },

      open: (highlightedId = null) =>
        set((s) => ({
          isOpen: true,
          // When opening without a specific target, default to the most
          // recent artifact so the preview pane is never blank.
          highlightedId:
            highlightedId ?? s.artifacts[s.artifacts.length - 1]?.id ?? null,
        })),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setAutoOpen: (enabled) => set({ autoOpen: enabled }),
      setModalSize: (size) => set({ modalSize: size }),

      remove: (id) =>
        set((s) => ({
          artifacts: s.artifacts.filter((a) => a.id !== id),
          highlightedId: s.highlightedId === id ? null : s.highlightedId,
        })),

      clear: () => set({ artifacts: [], highlightedId: null, pendingTurn: [] }),

      clearSession: (sessionId) =>
        set((s) => ({
          artifacts: s.artifacts.filter((a) => a.sessionId !== sessionId),
        })),
    }),
    {
      name: 'claudegui-artifacts',
      version: 4,
      partialize: (state) => ({
        // Only persist the most recent 30 artifacts to avoid blowing
        // the localStorage quota with large inline content.
        artifacts: state.artifacts.slice(-MAX_PERSISTED),
        autoOpen: state.autoOpen,
        modalSize: state.modalSize,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const paths = state.artifacts
          .filter((a) => a.filePath)
          .map((a) => a.filePath!) as string[];
        if (paths.length > 0) registerArtifactPaths(paths);
      },
      migrate: (persistedState, fromVersion) => {
        // v1 records lack `source`/`updatedAt`; v2 lacks `modalSize`. Fill in
        // safe defaults so older persisted shapes hydrate cleanly.
        const state = persistedState as Partial<ArtifactState> | undefined;
        if (!state) return persistedState as ArtifactState;
        let working = state;
        if (fromVersion < 2) {
          working = {
            ...working,
            artifacts: (working.artifacts ?? []).map((a) => {
              const anyA = a as Artifact & { source?: string; updatedAt?: number };
              return {
                ...anyA,
                source: anyA.source ?? 'inline',
                updatedAt: anyA.updatedAt ?? anyA.createdAt ?? Date.now(),
              } as Artifact;
            }),
          };
        }
        if (fromVersion < 3) {
          working = { ...working, modalSize: working.modalSize ?? null };
        }
        if (fromVersion < 4) {
          // v4: trim persisted artifacts to MAX_PERSISTED (30) — older
          // versions stored up to 200 which could blow the localStorage quota.
          const arts = working.artifacts ?? [];
          if (arts.length > MAX_PERSISTED) {
            working = { ...working, artifacts: arts.slice(arts.length - MAX_PERSISTED) };
          }
        }
        return working as ArtifactState;
      },
    },
  ),
);
