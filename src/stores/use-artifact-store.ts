'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  extractArtifacts,
  type ExtractedArtifact,
} from '@/lib/claude/artifact-extractor';

const MAX_ARTIFACTS = 200;

export type Artifact = ExtractedArtifact;

interface ArtifactState {
  artifacts: Artifact[];
  isOpen: boolean;
  autoOpen: boolean;
  highlightedId: string | null;
  pendingTurn: string[];

  extractFromMessage: (
    messageId: string,
    sessionId: string | null,
    text: string,
    options?: { silent?: boolean },
  ) => string[];
  flushPendingOpen: () => void;
  open: (highlightedId?: string | null) => void;
  close: () => void;
  toggle: () => void;
  setAutoOpen: (enabled: boolean) => void;
  remove: (id: string) => void;
  clear: () => void;
  clearSession: (sessionId: string | null) => void;
}

function dedupe(existing: Artifact[], incoming: Artifact[]): Artifact[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((a) => [a.id, a] as const));
  for (const next of incoming) {
    byId.set(next.id, next);
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

      open: (highlightedId = null) => set({ isOpen: true, highlightedId }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setAutoOpen: (enabled) => set({ autoOpen: enabled }),

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
      version: 1,
      partialize: (state) => ({
        artifacts: state.artifacts,
        autoOpen: state.autoOpen,
      }),
    },
  ),
);
