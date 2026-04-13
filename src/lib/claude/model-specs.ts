export interface ModelSpec {
  id: string;
  displayName: string;
  description: string;
  contextWindow: number;
  maxOutput: number;
  inputPricePer1M: number;
  outputPricePer1M: number;
  capabilities: string[];
}

/**
 * Model specs aligned with Claude Code `/model` command output.
 *
 * Context windows & pricing sourced from Anthropic's public documentation.
 * - Opus 4.6:  1M context (Claude Code default), $15/$75 per 1M tokens
 * - Sonnet 4.6: 200K context, $3/$15 per 1M tokens
 * - Haiku 4.5: 200K context, $0.80/$4 per 1M tokens
 */
export const MODEL_SPECS: ModelSpec[] = [
  {
    id: 'opus',
    displayName: 'Opus 4.6',
    description: 'Most capable for complex work',
    contextWindow: 200_000,
    maxOutput: 32_000,
    inputPricePer1M: 15,
    outputPricePer1M: 75,
    capabilities: ['vision', 'code', 'extended-thinking'],
  },
  {
    id: 'opus[1m]',
    displayName: 'Opus 4.6 (1M)',
    description: 'Most capable — extended 1M context',
    contextWindow: 1_000_000,
    maxOutput: 32_000,
    inputPricePer1M: 15,
    outputPricePer1M: 75,
    capabilities: ['vision', 'code', 'extended-thinking'],
  },
  {
    id: 'sonnet',
    displayName: 'Sonnet 4.6',
    description: 'Best for everyday tasks',
    contextWindow: 200_000,
    maxOutput: 16_000,
    inputPricePer1M: 3,
    outputPricePer1M: 15,
    capabilities: ['vision', 'code', 'extended-thinking'],
  },
  {
    id: 'haiku',
    displayName: 'Haiku 4.5',
    description: 'Fastest for quick answers',
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

/** Fuzzy match: tries exact match first, then prefix/contains match (e.g. SDK may report a dated variant). */
export function findModelSpec(modelId: string): ModelSpec | undefined {
  const exact = getModelSpec(modelId);
  if (exact) return exact;
  // Normalize: "claude-opus-4-6-20260301" → check if it contains a known short name
  const lower = modelId.toLowerCase();
  if (lower.includes('opus')) {
    // Prefer the 1M variant if the id explicitly mentions 1m
    if (lower.includes('1m')) return getModelSpec('opus[1m]');
    return getModelSpec('opus');
  }
  if (lower.includes('sonnet')) return getModelSpec('sonnet');
  if (lower.includes('haiku')) return getModelSpec('haiku');
  return undefined;
}
