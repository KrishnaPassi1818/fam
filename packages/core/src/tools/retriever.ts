import { estimateTokens, type ToolDescriptor } from '@fam/shared';
import { EmbeddingService, cosineSimilarity } from './embedding.js';
import type { FastPathDecision } from '../router/rules.js';

export interface ToolRetrieverOptions {
  embeddingService?: EmbeddingService;
  coreToolNames?: string[];
  defaultTopK?: number;
  categoryBoost?: number;
}

export const DEFAULT_CORE_TOOLS = [
  'core.find_tools',
  'find_tools',
  'core.blob_read',
  'core.todo',
  'todo',
  'core.remember',
  'remember',
];

export interface ScoredTool {
  tool: ToolDescriptor;
  score: number;
  baseScore: number;
  categoryBoost: number;
}

export class ToolRetriever {
  private readonly embeddingService: EmbeddingService;
  private readonly coreToolNames: Set<string>;
  private readonly defaultTopK: number;
  private readonly categoryBoost: number;

  private readonly registry = new Map<string, ToolDescriptor>();
  private readonly stickyTools = new Set<string>(); // Tool names recently invoked in current session

  constructor(options: ToolRetrieverOptions = {}) {
    this.embeddingService = options.embeddingService || new EmbeddingService();
    this.coreToolNames = new Set(options.coreToolNames || DEFAULT_CORE_TOOLS);
    this.defaultTopK = options.defaultTopK ?? 6;
    this.categoryBoost = options.categoryBoost ?? 0.2;
  }

  public async registerTools(tools: ToolDescriptor[]): Promise<void> {
    // Embed tools if needed
    const embedded = await this.embeddingService.embedTools(tools);
    for (const tool of embedded) {
      this.registry.set(tool.name, tool);
    }
  }

  public registerTool(tool: ToolDescriptor): void {
    this.registry.set(tool.name, tool);
  }

  public markToolUsed(toolName: string): void {
    if (this.registry.has(toolName) && !this.coreToolNames.has(toolName)) {
      this.stickyTools.add(toolName);
    }
  }

  public clearStickyTools(): void {
    this.stickyTools.clear();
  }

  public getTool(nameOrAlias: string): ToolDescriptor | undefined {
    // Check by name
    if (this.registry.has(nameOrAlias)) {
      return this.registry.get(nameOrAlias);
    }
    // Check by alias
    for (const tool of this.registry.values()) {
      if (tool.alias === nameOrAlias) {
        return tool;
      }
    }
    return undefined;
  }

  public getAllTools(): ToolDescriptor[] {
    return Array.from(this.registry.values());
  }

  /**
   * Retrieves the most relevant tools for a given query and routing context.
   * Merges:
   * 1. Top-K candidates scored by cosine similarity + category boost
   * 2. Sticky tools used in recent turns
   * 3. Always-available core tools
   */
  public async retrieve(
    query: string,
    routerContext?: Partial<FastPathDecision> | null,
    topK = this.defaultTopK
  ): Promise<ToolDescriptor[]> {
    const allTools = Array.from(this.registry.values());

    // Separate candidate tools from core tools
    const coreTools: ToolDescriptor[] = [];
    const candidateTools: ToolDescriptor[] = [];

    for (const tool of allTools) {
      if (this.coreToolNames.has(tool.name)) {
        coreTools.push(tool);
      } else {
        candidateTools.push(tool);
      }
    }

    if (candidateTools.length === 0) {
      return coreTools;
    }

    // Skip embedding call for empty queries or general conversational turns
    const shouldEmbed =
      query.trim().length > 0 && routerContext?.intent !== 'general';

    let queryEmbedding: number[] | null = null;
    if (shouldEmbed) {
      try {
        queryEmbedding = await this.embeddingService.embedText(query);
      } catch {
        queryEmbedding = null;
      }
    }

    // Score all candidates
    const categories = new Set(routerContext?.categories || []);
    if (routerContext?.intent) {
      categories.add(routerContext.intent);
    }

    const scored: ScoredTool[] = [];
    for (const tool of candidateTools) {
      let baseScore = 0;
      if (queryEmbedding && tool.embedding && tool.embedding.length > 0) {
        baseScore = cosineSimilarity(queryEmbedding, tool.embedding);
      } else {
        // Text keyword heuristic fallback if no embeddings
        const queryLower = query.toLowerCase();
        const propNames = Object.keys((tool.inputSchema?.properties || {}) as Record<string, unknown>).join(' ');
        const textToMatch = `${tool.name} ${tool.alias || ''} ${tool.description} ${tool.category} ${propNames}`.toLowerCase();
        const queryTerms = queryLower.split(/\s+/).filter((w) => w.length > 2);
        let matches = 0;
        for (const term of queryTerms) {
          if (textToMatch.includes(term)) {
            matches++;
          } else if ((term === 'save' || term === 'saving') && (textToMatch.includes('write') || textToMatch.includes('create'))) {
            matches++;
          } else if (term === 'fetch' && textToMatch.includes('read')) {
            matches++;
          }
        }
        baseScore = queryTerms.length > 0 ? matches / queryTerms.length : 0;
      }

      // Category boost
      let catBoost = 0;
      if (categories.has(tool.category)) {
        catBoost = this.categoryBoost;
      } else if (
        (routerContext?.needs_code && (tool.category === 'code' || tool.category === 'fs' || tool.category === 'git')) ||
        (routerContext?.needs_office && tool.category === 'office') ||
        (routerContext?.needs_web && (tool.category === 'web' || tool.category === 'browser'))
      ) {
        catBoost = this.categoryBoost;
      }

      scored.push({
        tool,
        baseScore,
        categoryBoost: catBoost,
        score: baseScore + catBoost,
      });
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    // Pick top-K candidates
    const selectedMap = new Map<string, ToolDescriptor>();
    for (let i = 0; i < Math.min(topK, scored.length); i++) {
      const item = scored[i]!;
      selectedMap.set(item.tool.name, item.tool);
    }

    // Include sticky tools (recently used)
    for (const stickyName of this.stickyTools) {
      if (!selectedMap.has(stickyName) && this.registry.has(stickyName)) {
        selectedMap.set(stickyName, this.registry.get(stickyName)!);
      }
    }

    // Include core tools
    for (const coreTool of coreTools) {
      if (!selectedMap.has(coreTool.name)) {
        selectedMap.set(coreTool.name, coreTool);
      }
    }

    return Array.from(selectedMap.values());
  }

  /**
   * Shortens tool descriptions for small models or tight contexts.
   * Reports token savings.
   */
  public shortenForSmallModel(tools: ToolDescriptor[]): { tools: ToolDescriptor[]; savedTokens: number } {
    let originalTokens = 0;
    let shortenedTokens = 0;

    const shortenedTools = tools.map((tool) => {
      originalTokens += estimateTokens(tool.description);

      let newDesc = tool.shortDescription;
      if (!newDesc) {
        // Truncate description to <= 15 words
        const words = tool.description.trim().split(/\s+/);
        if (words.length > 15) {
          newDesc = words.slice(0, 15).join(' ') + '...';
        } else {
          newDesc = tool.description;
        }
      }

      shortenedTokens += estimateTokens(newDesc);

      return {
        ...tool,
        description: newDesc,
      };
    });

    const savedTokens = Math.max(0, originalTokens - shortenedTokens);
    return { tools: shortenedTools, savedTokens };
  }
}
