import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { estimateTokens } from '@hx/shared';

export interface PromptLayerInfo {
  layer: number;
  name: string;
  tokens: number;
  dropped: boolean;
  content: string;
}

export interface BuiltPromptResult {
  systemPrompt: string;
  stablePrefix: string;
  dynamicSuffix: string;
  totalTokens: number;
  budget: number;
  layers: PromptLayerInfo[];
}

export interface BuildPromptOptions {
  modelId: string;
  role: 'assistant' | 'coder' | 'router';
  tier?: 'full' | 'medium' | 'min';
  userGlobalPrompt?: string;
  projectPrompt?: string;
  dynamicContext?: {
    date?: string;
    os?: string;
    cwd?: string;
    gitBranch?: string;
    memories?: string[];
    activeToolHints?: string[];
  };
}

export function resolvePromptsDir(startDir?: string): string {
  let curr = startDir || process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(curr, 'prompts');
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'core.md'))) {
      return candidate;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(process.cwd(), 'prompts');
}

export class PromptApprovalStore {
  private readonly storePath: string;
  private approvals: Record<string, string> = {};

  constructor(dataDir?: string) {
    const base = dataDir || path.join(os.homedir(), '.harness');
    this.storePath = path.join(base, 'approvals.json');
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.storePath)) {
      try {
        const raw = fs.readFileSync(this.storePath, 'utf-8');
        this.approvals = JSON.parse(raw);
      } catch {
        this.approvals = {};
      }
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.storePath, JSON.stringify(this.approvals, null, 2), 'utf-8');
    } catch {
      // Best-effort persist
    }
  }

  public hash(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  public isApproved(filePath: string, content: string): boolean {
    const key = path.resolve(filePath);
    const contentHash = this.hash(content);
    return this.approvals[key] === contentHash;
  }

  public approve(filePath: string, content: string): void {
    const key = path.resolve(filePath);
    this.approvals[key] = this.hash(content);
    this.save();
  }
}

export class PromptBuilder {
  private readonly promptsDir: string;
  private readonly dataDir: string;
  private readonly approvalStore: PromptApprovalStore;

  constructor(options?: { promptsDir?: string; dataDir?: string }) {
    this.promptsDir = options?.promptsDir || resolvePromptsDir();
    this.dataDir = options?.dataDir || path.join(os.homedir(), '.harness');
    this.approvalStore = new PromptApprovalStore(this.dataDir);
  }

  public getApprovalStore(): PromptApprovalStore {
    return this.approvalStore;
  }

  private readPromptBody(filePath: string): string {
    if (!fs.existsSync(filePath)) return '';
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (match) {
      return content.slice(match[0].length).trim();
    }
    return content.trim();
  }

  private resolveModelDetails(modelId: string, requestedTier?: 'full' | 'medium' | 'min'): {
    family: string;
    tier: 'full' | 'medium' | 'min';
    budget: number;
  } {
    if (modelId.startsWith('gemini:')) {
      return {
        family: 'gemini',
        tier: requestedTier || 'full',
        budget: 4000,
      };
    }
    if (modelId.includes('coder')) {
      return {
        family: 'qwen-coder',
        tier: requestedTier || 'medium',
        budget: 600,
      };
    }
    if (modelId.includes('1.5b')) {
      return {
        family: 'qwen',
        tier: requestedTier || 'min',
        budget: 150,
      };
    }
    return {
      family: 'llama3',
      tier: requestedTier || 'medium',
      budget: 600,
    };
  }

  public build(options: BuildPromptOptions, cwd = process.cwd()): BuiltPromptResult {
    const { family, tier, budget } = this.resolveModelDetails(options.modelId, options.tier);

    // Layer 1: Core rules (non-removable for interactive roles; omitted for router/min classification)
    let coreBody = '';
    if (tier !== 'min' && options.role !== 'router') {
      const corePath = path.join(this.promptsDir, 'core.md');
      coreBody = this.readPromptBody(corePath);
    }

    // Layer 2: Model profile
    const profilePath = path.join(this.promptsDir, 'profiles', `${family}.md`);
    const profileBody = this.readPromptBody(profilePath);

    // Layer 3: Role prompt
    const rolePath = path.join(this.promptsDir, 'roles', `${options.role}.${tier}.md`);
    const roleBody = this.readPromptBody(rolePath);

    // Stable prefix: Byte-identical across turns
    const stableLayers = [coreBody, profileBody, roleBody].filter(Boolean);
    const stablePrefix = stableLayers.join('\n\n');

    // Layer 4: User Global (~/.harness/SYSTEM.md)
    let userGlobal = options.userGlobalPrompt || '';
    if (!userGlobal) {
      const userFile = path.join(this.dataDir, 'SYSTEM.md');
      if (fs.existsSync(userFile)) {
        userGlobal = fs.readFileSync(userFile, 'utf-8').trim();
      }
    }

    // Layer 5: Project prompt (HARNESS.md or AGENTS.md in cwd)
    let projectPrompt = options.projectPrompt || '';
    if (!projectPrompt) {
      const candidates = [path.join(cwd, 'HARNESS.md'), path.join(cwd, 'AGENTS.md')];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          const content = fs.readFileSync(cand, 'utf-8').trim();
          if (content.length > 0 && this.approvalStore.isApproved(cand, content)) {
            projectPrompt = content;
            break;
          }
        }
      }
    }

    // Layer 6: Dynamic context
    const dynamicParts: string[] = [];
    const ctx = options.dynamicContext || {};
    if (ctx.date) dynamicParts.push(`- Current time: ${ctx.date}`);
    if (ctx.os) dynamicParts.push(`- Host OS: ${ctx.os}`);
    if (ctx.cwd) dynamicParts.push(`- Working directory: ${ctx.cwd}`);
    if (ctx.gitBranch) dynamicParts.push(`- Git branch: ${ctx.gitBranch}`);
    if (ctx.memories && ctx.memories.length > 0) {
      dynamicParts.push('\n## Relevant Memory');
      for (const mem of ctx.memories) {
        dynamicParts.push(`- ${mem}`);
      }
    }
    if (ctx.activeToolHints && ctx.activeToolHints.length > 0) {
      dynamicParts.push('\n## Active Tool Hints');
      for (const hint of ctx.activeToolHints) {
        dynamicParts.push(`- ${hint}`);
      }
    }
    const dynamicBody = dynamicParts.join('\n');

    // Assemble layers with metadata
    const layers: PromptLayerInfo[] = [
      { layer: 1, name: 'core', tokens: estimateTokens(coreBody), dropped: false, content: coreBody },
      { layer: 2, name: 'profile', tokens: estimateTokens(profileBody), dropped: false, content: profileBody },
      { layer: 3, name: 'role', tokens: estimateTokens(roleBody), dropped: false, content: roleBody },
      { layer: 4, name: 'user_global', tokens: estimateTokens(userGlobal), dropped: false, content: userGlobal },
      { layer: 5, name: 'project', tokens: estimateTokens(projectPrompt), dropped: false, content: projectPrompt },
      { layer: 6, name: 'dynamic', tokens: estimateTokens(dynamicBody), dropped: false, content: dynamicBody },
    ];

    // Budget enforcement and drop order:
    // Drop order: dynamic hints -> project -> user -> profile -> role trimmed
    // Core is NEVER dropped.
    let currentTokens = layers.reduce((acc, l) => acc + (l.dropped ? 0 : l.tokens), 0);

    const dropSequence = [5, 4, 3, 1]; // indices in layers: dynamic, project, user, profile
    for (const idx of dropSequence) {
      const layer = layers[idx];
      if (layer && !layer.dropped && currentTokens > budget) {
        layer.dropped = true;
        currentTokens -= layer.tokens;
      }
    }

    // Assemble final prompt
    const activeLayers = layers.filter((l) => !l.dropped && l.content.length > 0);
    const systemPrompt = activeLayers.map((l) => l.content).join('\n\n');
    const dynamicSuffix = activeLayers.filter((l) => l.layer > 3).map((l) => l.content).join('\n\n');

    return {
      systemPrompt,
      stablePrefix,
      dynamicSuffix,
      totalTokens: estimateTokens(systemPrompt),
      budget,
      layers,
    };
  }
}
