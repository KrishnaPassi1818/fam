import type { PrivacyLevel } from '@hx/shared';

export type MemoryKind = 'semantic' | 'episodic';
export type MemorySource = 'user' | 'extracted' | 'tool';

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  text: string;
  tags: string[];
  scope: string; // 'global' | 'project:<hash>'
  importance: number; // 0.0 to 1.0
  privacy: PrivacyLevel; // 'normal' | 'local_only'
  source: MemorySource;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  supersededBy?: string | null;
  embedding?: number[];
}

export interface MemoryScoreResult {
  memory: MemoryItem;
  similarity: number;
  recencyScore: number;
  importanceScore: number;
  finalScore: number;
}

export interface RetrieveMemoryOptions {
  scope?: string;
  maxTokens?: number; // default 400 tokens cap
  minScore?: number; // default 0.35
  limit?: number; // default 10
  forModelProvider?: string; // e.g. 'gemini' | 'ollama' - if 'gemini', local_only memories are purged
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface ExtractedCandidate {
  text: string;
  kind: MemoryKind;
  tags: string[];
  importance: number;
  privacy: PrivacyLevel;
}
