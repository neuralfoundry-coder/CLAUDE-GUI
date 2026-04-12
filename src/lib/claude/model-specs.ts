export interface ModelSpec {
  id: string;
  displayName: string;
  contextWindow: number;
  maxOutput: number;
  inputPricePer1M: number;
  outputPricePer1M: number;
  capabilities: string[];
}

export const MODEL_SPECS: ModelSpec[] = [
  {
    id: 'claude-opus-4-6',
    displayName: 'Opus 4',
    contextWindow: 200_000,
    maxOutput: 32_000,
    inputPricePer1M: 15,
    outputPricePer1M: 75,
    capabilities: ['vision', 'code', 'extended-thinking'],
  },
  {
    id: 'claude-sonnet-4-6',
    displayName: 'Sonnet 4',
    contextWindow: 200_000,
    maxOutput: 16_000,
    inputPricePer1M: 3,
    outputPricePer1M: 15,
    capabilities: ['vision', 'code', 'extended-thinking'],
  },
  {
    id: 'claude-haiku-4-5-20251001',
    displayName: 'Haiku 4.5',
    contextWindow: 200_000,
    maxOutput: 8_192,
    inputPricePer1M: 0.8,
    outputPricePer1M: 4,
    capabilities: ['vision', 'code'],
  },
];

/** Exact match by model ID. */
export function getModelSpec(modelId: string): ModelSpec | undefined {
  return MODEL_SPECS.find((m) => m.id === modelId);
}

/** Fuzzy match: tries exact match first, then prefix match (e.g. SDK may report a dated variant). */
export function findModelSpec(modelId: string): ModelSpec | undefined {
  const exact = getModelSpec(modelId);
  if (exact) return exact;
  // Try prefix: "claude-opus-4-6-20260301" → matches "claude-opus-4-6"
  return MODEL_SPECS.find((m) => modelId.startsWith(m.id));
}
