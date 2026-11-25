import fs from 'fs';
import path from 'path';
import { parse } from 'smol-toml';
import { PrivacyBlocked, type RoutingConfig, type RoutingRule } from '@fam/shared';
import type { FastPathDecision } from './rules.js';
import { resolvePath } from '../config/index.js';

export interface RoutingPolicyOptions {
  config?: RoutingConfig;
  configPath?: string;
}

export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  defaultChain: ['ollama:qwen3.5:4b', 'gemini:gemini-2.5-flash'],
  rules: [
    {
      intent: 'coding',
      maxComplexity: 3,
      privacy: 'normal',
      chain: ['ollama:qwen2.5-coder:7b', 'gemini:gemini-2.5-flash'],
    },
    {
      intent: 'coding',
      minComplexity: 4,
      privacy: 'normal',
      chain: ['gemini:gemini-2.5-flash', 'ollama:qwen2.5-coder:7b'],
    },
    {
      intent: 'office',
      privacy: 'normal',
      chain: ['ollama:qwen3.5:4b', 'gemini:gemini-2.5-flash'],
    },
    {
      intent: 'web',
      privacy: 'normal',
      chain: ['gemini:gemini-2.5-flash', 'ollama:qwen3.5:4b'],
    },
    {
      intent: 'system',
      privacy: 'normal',
      chain: ['ollama:qwen3.5:4b'],
    },
    {
      intent: 'general',
      maxComplexity: 2,
      privacy: 'normal',
      chain: ['ollama:qwen3.5:4b'],
    },
    {
      privacy: 'local_only',
      chain: ['ollama:qwen3.5:4b', 'ollama:qwen2.5-coder:7b'],
    },
  ],
};

export class RoutingPolicy {
  private config: RoutingConfig;

  constructor(options: RoutingPolicyOptions = {}) {
    if (options.config) {
      this.config = options.config;
    } else if (options.configPath) {
      this.config = this.loadFromFile(options.configPath);
    } else {
      this.config = this.loadDefault();
    }
  }

  private loadDefault(): RoutingConfig {
    // Try ~/.fam/routing.toml then bundled config/routing.toml
    const userPath = resolvePath('~/.fam/routing.toml');
    if (fs.existsSync(userPath)) {
      return this.loadFromFile(userPath);
    }
    const bundledPath = path.resolve(process.cwd(), 'config/routing.toml');
    if (fs.existsSync(bundledPath)) {
      return this.loadFromFile(bundledPath);
    }
    return DEFAULT_ROUTING_CONFIG;
  }

  private loadFromFile(filePath: string): RoutingConfig {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parse(content) as Record<string, unknown>;
      const rawRouting = (parsed['routing'] || parsed) as Record<string, unknown>;

      const defaultChain = (rawRouting['default_chain'] || rawRouting['defaultChain']) as string[] | undefined;
      const rawRules = (rawRouting['rules'] || []) as Record<string, unknown>[];
      const rules: RoutingRule[] = rawRules.map((rule) => ({
        intent: rule['intent'] as RoutingRule['intent'],
        minComplexity: (rule['min_complexity'] ?? rule['minComplexity']) as number | undefined,
        maxComplexity: (rule['max_complexity'] ?? rule['maxComplexity']) as number | undefined,
        privacy: (rule['privacy'] as RoutingRule['privacy']) || undefined,
        chain: (rule['chain'] as string[]) || [],
      }));

      return {
        defaultChain: defaultChain || DEFAULT_ROUTING_CONFIG.defaultChain,
        rules: rules.length > 0 ? rules : DEFAULT_ROUTING_CONFIG.rules,
      };
    } catch {
      return DEFAULT_ROUTING_CONFIG;
    }
  }

  /**
   * Resolves the ordered model chain based on the routing decision and optional override.
   * Enforces that local_only requests NEVER route to Gemini or cloud providers.
   */
  public resolve(decision: FastPathDecision, overrideModel?: string): string[] {
    let resolvedChain: string[] = [];

    // Find the first matching rule
    for (const rule of this.config.rules) {
      if (rule.privacy && rule.privacy !== decision.privacy) {
        continue;
      }
      if (rule.intent && rule.intent !== decision.intent) {
        continue;
      }
      if (rule.minComplexity !== undefined && decision.complexity < rule.minComplexity) {
        continue;
      }
      if (rule.maxComplexity !== undefined && decision.complexity > rule.maxComplexity) {
        continue;
      }

      resolvedChain = [...rule.chain];
      break;
    }

    if (resolvedChain.length === 0) {
      resolvedChain = [...this.config.defaultChain];
    }

    // NON-NEGOTIABLE PRIVACY ENFORCEMENT
    if (decision.privacy === 'local_only') {
      // If user explicitly asks for cloud model on a local_only prompt, reject immediately!
      if (overrideModel && this.isCloudModel(overrideModel)) {
        throw new PrivacyBlocked(
          overrideModel,
          `Cannot use cloud model for request containing sensitive or local-only data.`
        );
      }

      // Filter out all cloud models from the resolved chain
      resolvedChain = resolvedChain.filter((m) => !this.isCloudModel(m));

      // Guarantee at least one local model is present
      if (resolvedChain.length === 0) {
        resolvedChain = ['ollama:qwen3.5:4b'];
      }
    }

    // Apply model override if provided
    if (overrideModel) {
      const normalizedOverride = overrideModel.startsWith('ollama:') || overrideModel.startsWith('gemini:')
        ? overrideModel
        : `ollama:${overrideModel}`;

      resolvedChain = [normalizedOverride, ...resolvedChain.filter((m) => m !== normalizedOverride)];
    }

    return resolvedChain;
  }

  private isCloudModel(modelId: string): boolean {
    return modelId.startsWith('gemini:') || modelId.startsWith('google:') || modelId.startsWith('cloud:');
  }

  public getConfig(): RoutingConfig {
    return this.config;
  }
}
