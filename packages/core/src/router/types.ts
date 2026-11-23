import type { Intent, PrivacyLevel, RoutingRule } from '@fam/shared';

export type { Intent, PrivacyLevel, RoutingRule };

export interface RoutingDecision {
  intent: Intent;
  complexity: number; // 1 to 5
  categories: string[];
  needs_code: boolean;
  needs_web: boolean;
  needs_office: boolean;
  privacy: PrivacyLevel;
  confidence: number;
  reasoning?: string;
  modelChain: string[];
  source: 'rules' | 'llm' | 'fallback';
}

export interface RouterOptions {
  model?: string; // default router model, e.g. "ollama:qwen2.5:1.5b"
  baseUrl?: string;
  confidenceThreshold?: number; // threshold to accept fast-path or LLM decision (default 0.75)
  timeoutMs?: number;
}
