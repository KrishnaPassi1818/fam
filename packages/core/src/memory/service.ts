import crypto from 'crypto';
import { estimateTokens } from '@hx/shared';
import { MemoryDatabase } from './db.js';
import { EmbeddingService, cosineSimilarity } from '../tools/embedding.js';
import { PrivacyGate } from '../privacy/index.js';
import { detectPrivacyFastPath } from '../router/rules.js';
import type {
  MemoryItem,
  MemoryKind,
  MemoryScoreResult,
  RetrieveMemoryOptions,
} from './types.js';

export interface MemoryServiceOptions {
  db?: MemoryDatabase;
  embeddingService?: EmbeddingService;
  privacyGate?: PrivacyGate;
  cwd?: string;
}

export class MemoryService {
  private readonly db: MemoryDatabase;
  private readonly embeddingService: EmbeddingService;
  private readonly privacyGate: PrivacyGate;
  private readonly currentProjectScope: string;

  constructor(options: MemoryServiceOptions = {}) {
    this.db = options.db || new MemoryDatabase();
    this.embeddingService = options.embeddingService || new EmbeddingService();
    this.privacyGate = options.privacyGate || new PrivacyGate();

    const cwd = options.cwd || process.cwd();
    const hash = crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 12);
    this.currentProjectScope = `project:${hash}`;
  }

  public getProjectScope(): string {
    return this.currentProjectScope;
  }

  /**
   * Write path: remember explicit fact or episodic outcome.
   * - Enforces privacy check (detects secrets, marks local_only)
   * - Generates vector embedding
   * - Dedup and supersede against existing memories
   */
  public async remember(params: {
    text: string;
    kind?: MemoryKind;
    tags?: string[];
    scope?: 'global' | 'project';
    importance?: number;
    source?: 'user' | 'extracted' | 'tool';
  }): Promise<{ id: string; action: 'created' | 'bumped' | 'superseded' }> {
    const text = params.text.trim();
    const kind: MemoryKind = params.kind || 'semantic';
    const tags = params.tags || [];
    const scope = params.scope === 'project' ? this.currentProjectScope : 'global';
    const importance = params.importance ?? 0.5;
    const source = params.source || 'user';
    const now = Date.now();

    // 1. Privacy check: never send secrets to external models
    let privacy: 'normal' | 'local_only' = 'normal';
    if (detectPrivacyFastPath(text) === 'local_only' || this.privacyGate.detectSecrets(text).length > 0) {
      privacy = 'local_only';
    }

    // 2. Embed the text
    let embedding: number[] = [];
    try {
      embedding = await this.embeddingService.embedText(text);
    } catch {
      // Embedding fallback
      embedding = [];
    }

    // 3. Dedup and supersede check against active memories
    const activeMemories = this.db.getAllActiveMemories([scope, 'global']);
    for (const oldMem of activeMemories) {
      // First check direct text equivalence
      if (this.isEquivalent(text, oldMem.text)) {
        this.db.bumpUseCount(oldMem.id);
        return { id: oldMem.id, action: 'bumped' };
      }

      if (oldMem.embedding && embedding.length > 0) {
        const sim = cosineSimilarity(embedding, oldMem.embedding);

        // Near-identical match (> 0.9 similarity)
        if (sim >= 0.90) {
          // If it updates or contradicts the old memory, supersede it
          const newId = `mem_${now}_${Math.random().toString(36).substring(2, 7)}`;
          this.db.markSuperseded(oldMem.id, newId);
          this.db.insertMemory(
            {
              id: newId,
              kind,
              text,
              tags,
              scope,
              importance,
              privacy,
              source,
              createdAt: now,
              lastUsedAt: now,
              useCount: 1,
            },
            embedding
          );
          return { id: newId, action: 'superseded' };
        }
      }
    }

    // 4. Insert fresh memory
    const newId = `mem_${now}_${Math.random().toString(36).substring(2, 7)}`;
    this.db.insertMemory(
      {
        id: newId,
        kind,
        text,
        tags,
        scope,
        importance,
        privacy,
        source,
        createdAt: now,
        lastUsedAt: now,
        useCount: 1,
      },
      embedding
    );

    return { id: newId, action: 'created' };
  }

  /**
   * Read path: retrieves ranked memories relevant to the query.
   * - Filters by scope (global + current project)
   * - Evaluates similarity, recency decay (30d half-life), and importance
   * - Drops score < 0.35
   * - Enforces 400 token cap
   * - Filters out local_only memories if destination model is Gemini
   */
  public async retrieve(
    query: string,
    options: RetrieveMemoryOptions = {}
  ): Promise<MemoryScoreResult[]> {
    const maxTokens = options.maxTokens ?? 400;
    const minScore = options.minScore ?? 0.35;
    const limit = options.limit ?? 10;
    const isGemini = options.forModelProvider === 'gemini';

    const scopes = options.scope ? [options.scope, 'global'] : [this.currentProjectScope, 'global'];
    let candidates = this.db.getAllActiveMemories(scopes);

    // Filter out local_only memories if sending to Gemini
    if (isGemini) {
      candidates = candidates.filter((m) => m.privacy !== 'local_only');
    }

    if (candidates.length === 0) {
      return [];
    }

    // Embed query
    let queryEmb: number[] | null = null;
    try {
      queryEmb = await this.embeddingService.embedText(query);
    } catch {
      queryEmb = null;
    }

    const now = Date.now();
    const halfLifeMs = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

    const scored: MemoryScoreResult[] = [];

    for (const mem of candidates) {
      // Calculate cosine similarity
      let sim = 0;
      if (queryEmb && mem.embedding && mem.embedding.length > 0) {
        sim = cosineSimilarity(queryEmb, mem.embedding);
      } else {
        // Fallback keyword overlap
        sim = this.keywordOverlap(query, mem.text);
      }

      // Recency score: exponential decay
      const ageMs = Math.max(0, now - mem.lastUsedAt);
      const recencyScore = Math.exp((-Math.LN2 * ageMs) / halfLifeMs);

      const importanceScore = mem.importance;

      // Ranking formula per memory.md:
      // score = 0.6 * sim + 0.2 * recency + 0.2 * importance
      const finalScore = 0.6 * sim + 0.2 * recencyScore + 0.2 * importanceScore;

      if (finalScore >= minScore) {
        scored.push({
          memory: mem,
          similarity: sim,
          recencyScore,
          importanceScore,
          finalScore,
        });
      }
    }

    // Sort descending by finalScore
    scored.sort((a, b) => b.finalScore - a.finalScore);

    // Pick top under token cap
    const results: MemoryScoreResult[] = [];
    let accumulatedTokens = 0;

    for (const item of scored) {
      const itemTokens = estimateTokens(item.memory.text) + 5; // +5 for bullet prefix
      if (accumulatedTokens + itemTokens > maxTokens) {
        break;
      }
      accumulatedTokens += itemTokens;
      results.push(item);
      this.db.bumpUseCount(item.memory.id);

      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }

  public formatForPrompt(results: MemoryScoreResult[]): string {
    if (results.length === 0) return '';
    const lines = ['## Relevant memory'];
    for (const r of results) {
      lines.push(`- ${r.memory.text}`);
    }
    return lines.join('\n');
  }

  public forget(id: string): boolean {
    return this.db.deleteMemory(id);
  }

  public list(options: { scope?: string; limit?: number } = {}): MemoryItem[] {
    const all = this.db.getAllMemories();
    if (options.scope) {
      return all.filter((m) => m.scope === options.scope || m.scope === 'global');
    }
    return options.limit ? all.slice(0, options.limit) : all;
  }

  public wipe(): void {
    this.db.wipeAll();
  }

  public export(): string {
    const all = this.db.getAllMemories();
    return JSON.stringify(all, null, 2);
  }

  public import(jsonText: string): number {
    const items = JSON.parse(jsonText) as MemoryItem[];
    let count = 0;
    for (const item of items) {
      this.db.insertMemory(item, item.embedding);
      count++;
    }
    return count;
  }

  private isEquivalent(a: string, b: string): boolean {
    const cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanB = b.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanA === cleanB;
  }

  private keywordOverlap(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let matches = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) matches++;
    }
    return matches / Math.max(wordsA.size, wordsB.size);
  }
}
