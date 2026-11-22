import type { RoutingDecision, RouterOptions } from './types.js';
import { matchFastPath, fallbackClassification } from './rules.js';
import { LlmRouter } from './llm.js';
import { RoutingPolicy } from './policy.js';
import type { Tracer } from '../trace/index.js';

export * from './types.js';
export * from './rules.js';
export * from './llm.js';
export * from './policy.js';

export class Router {
  private readonly llmRouter: LlmRouter;
  private readonly policy: RoutingPolicy;
  private readonly confidenceThreshold: number;
  private readonly tracer?: Tracer;

  constructor(options: RouterOptions & { policy?: RoutingPolicy; tracer?: Tracer } = {}) {
    this.llmRouter = new LlmRouter({
      baseUrl: options.baseUrl,
      model: options.model,
      timeoutMs: options.timeoutMs,
    });
    this.policy = options.policy || new RoutingPolicy();
    this.confidenceThreshold = options.confidenceThreshold ?? 0.85;
    this.tracer = options.tracer;
  }

  public async route(prompt: string, overrideModel?: string): Promise<RoutingDecision> {
    const startTime = Date.now();

    // 1. Fast-path rules check (0ms CPU latency)
    const fastDecision = matchFastPath(prompt);
    if (fastDecision && fastDecision.confidence >= this.confidenceThreshold) {
      const modelChain = this.policy.resolve(fastDecision, overrideModel);
      const decision: RoutingDecision = {
        ...fastDecision,
        modelChain,
      };

      this.recordTrace(prompt, decision, Date.now() - startTime);
      return decision;
    }

    // 2. 1.5B LLM router on CPU
    let classified;
    try {
      classified = await this.llmRouter.classify(prompt);
    } catch {
      classified = fallbackClassification(prompt);
    }

    const modelChain = this.policy.resolve(classified, overrideModel);
    const decision: RoutingDecision = {
      ...classified,
      modelChain,
    };

    this.recordTrace(prompt, decision, Date.now() - startTime);
    return decision;
  }

  private recordTrace(prompt: string, decision: RoutingDecision, durationMs: number): void {
    if (!this.tracer) return;
    this.tracer.emit('route', {
      prompt: prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt,
      intent: decision.intent,
      complexity: decision.complexity,
      privacy: decision.privacy,
      confidence: decision.confidence,
      target: decision.modelChain[0],
      chain: decision.modelChain,
      source: decision.source,
      durationMs,
    });
  }
}
