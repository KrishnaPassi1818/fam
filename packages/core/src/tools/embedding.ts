import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ToolDescriptor } from '@hx/shared';
import { resolvePath } from '../config/index.js';

export interface CachedEmbedding {
  hash: string;
  embedding: number[];
  updatedAt: string;
}

export interface EmbeddingCacheFile {
  version: 1;
  model: string;
  embeddings: Record<string, CachedEmbedding>; // key = tool.name
}

export interface EmbeddingServiceOptions {
  baseUrl?: string;
  model?: string;
  cachePath?: string;
  timeoutMs?: number;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class EmbeddingService {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly cachePath: string;
  private readonly timeoutMs: number;
  private cache: Record<string, CachedEmbedding> = {};
  private cacheLoaded = false;

  constructor(options: EmbeddingServiceOptions = {}) {
    this.baseUrl = options.baseUrl || process.env['OLLAMA_BASE_URL'] || 'http://127.0.0.1:11434';
    const rawModel = options.model || 'nomic-embed-text';
    this.model = rawModel.replace(/^ollama:/, '');
    this.cachePath = options.cachePath || resolvePath('~/.harness/cache/tool_embeddings.json');
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  private loadCache(): void {
    if (this.cacheLoaded) return;
    try {
      if (fs.existsSync(this.cachePath)) {
        const data = fs.readFileSync(this.cachePath, 'utf-8');
        const parsed = JSON.parse(data) as EmbeddingCacheFile;
        if (parsed.version === 1 && parsed.model === this.model && parsed.embeddings) {
          this.cache = parsed.embeddings;
        }
      }
    } catch {
      this.cache = {};
    }
    this.cacheLoaded = true;
  }

  private saveCache(): void {
    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data: EmbeddingCacheFile = {
        version: 1,
        model: this.model,
        embeddings: this.cache,
      };
      const tmpPath = `${this.cachePath}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.cachePath);
    } catch {
      // Best-effort cache persist
    }
  }

  public computeToolHash(tool: ToolDescriptor): string {
    const signature = `${tool.name}:${tool.description}:${tool.shortDescription ?? ''}:${JSON.stringify(tool.inputSchema)}`;
    return crypto.createHash('sha256').update(signature).digest('hex');
  }

  public async embedText(text: string): Promise<number[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Embedding request failed with status ${response.status}`);
      }

      const data = (await response.json()) as { embedding?: number[] };
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Malformed embedding response from Ollama');
      }

      return data.embedding;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Embeds tools using the cached embeddings if valid, or fetching new embeddings.
   * Returns tools with updated tool.embedding fields.
   */
  public async embedTools(tools: ToolDescriptor[]): Promise<ToolDescriptor[]> {
    this.loadCache();
    let cacheDirty = false;
    const result: ToolDescriptor[] = [];

    for (const tool of tools) {
      const hash = this.computeToolHash(tool);
      const cached = this.cache[tool.name];

      if (cached && cached.hash === hash && cached.embedding.length > 0) {
        result.push({
          ...tool,
          embedding: cached.embedding,
        });
      } else {
        // Need to embed this tool
        try {
          const textToEmbed = `tool ${tool.name}: ${tool.description} category: ${tool.category}`;
          const embedding = await this.embedText(textToEmbed);
          this.cache[tool.name] = {
            hash,
            embedding,
            updatedAt: new Date().toISOString(),
          };
          cacheDirty = true;
          result.push({
            ...tool,
            embedding,
          });
        } catch {
          // If embedding fails (e.g. offline during tests), return tool without embedding
          result.push(tool);
        }
      }
    }

    if (cacheDirty) {
      this.saveCache();
    }

    return result;
  }

  public getCachedEmbedding(toolName: string): number[] | undefined {
    this.loadCache();
    return this.cache[toolName]?.embedding;
  }

  public clearCache(): void {
    this.cache = {};
    this.cacheLoaded = true;
    try {
      if (fs.existsSync(this.cachePath)) {
        fs.unlinkSync(this.cachePath);
      }
    } catch {
      // ignore
    }
  }
}
