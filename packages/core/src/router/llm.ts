import type { FastPathDecision } from './rules.js';
import { fallbackClassification, detectPrivacyFastPath } from './rules.js';
import type { Intent, PrivacyLevel } from './types.js';

export interface LlmRouterOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

const ROUTER_SYSTEM_PROMPT = `Classify the user prompt. Respond ONLY with a valid JSON object matching this schema:
{"intent":"coding"|"office"|"web"|"system"|"general","complexity":1,"needs_code":false,"needs_web":false,"needs_office":false,"privacy":"normal"|"local_only","confidence":0.95}
Complexity must be an integer from 1 to 5.
No explanations. Only JSON.`;

interface RawLlmResponse {
  intent?: string;
  complexity?: number;
  needs_code?: boolean;
  needs_web?: boolean;
  needs_office?: boolean;
  privacy?: string;
  confidence?: number;
}

export class LlmRouter {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: LlmRouterOptions = {}) {
    this.baseUrl = options.baseUrl || process.env['OLLAMA_BASE_URL'] || 'http://127.0.0.1:11434';
    // Strip provider prefix if provided
    const rawModel = options.model || 'qwen2.5:1.5b';
    this.model = rawModel.replace(/^ollama:/, '');
    this.timeoutMs = options.timeoutMs ?? 2500;
  }

  public async classify(prompt: string): Promise<FastPathDecision> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: ROUTER_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          format: 'json',
          stream: false,
          options: {
            temperature: 0.0,
            num_gpu: 0, // CRITICAL: router is strictly pinned to CPU
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama chat failed with status ${response.status}`);
      }

      const data = (await response.json()) as { message?: { content?: string } };
      const rawContent = data.message?.content?.trim() || '';

      const parsed = this.parseAndValidate(rawContent, prompt);
      return parsed;
    } catch {
      // Graceful fallback to heuristic classification on timeout/network error
      return fallbackClassification(prompt);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseAndValidate(rawJson: string, originalPrompt: string): FastPathDecision {
    let parsed: RawLlmResponse;
    try {
      // Find JSON block if wrapped in markdown
      const cleanJson = rawJson.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(cleanJson) as RawLlmResponse;
    } catch {
      return fallbackClassification(originalPrompt);
    }

    // Validate intent
    const validIntents: Intent[] = ['coding', 'office', 'web', 'system', 'general'];
    const intent: Intent = validIntents.includes(parsed.intent as Intent)
      ? (parsed.intent as Intent)
      : 'general';

    // Validate complexity (clamp 1-5)
    let complexity = typeof parsed.complexity === 'number' ? Math.round(parsed.complexity) : 1;
    if (complexity < 1) complexity = 1;
    if (complexity > 5) complexity = 5;

    // Validate flags
    const needs_code = Boolean(parsed.needs_code || intent === 'coding');
    const needs_web = Boolean(parsed.needs_web || intent === 'web');
    const needs_office = Boolean(parsed.needs_office || intent === 'office');

    // Validate privacy: rules fast path always takes precedence if local secrets detected
    const detectedFastPrivacy = detectPrivacyFastPath(originalPrompt);
    const privacy: PrivacyLevel =
      detectedFastPrivacy === 'local_only' || parsed.privacy === 'local_only'
        ? 'local_only'
        : 'normal';

    // Validate confidence
    let confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.85;
    if (confidence < 0) confidence = 0;
    if (confidence > 1) confidence = 1;

    // Build categories
    const categories: string[] = [];
    if (needs_code) categories.push('fs', 'code');
    if (needs_office) categories.push('office', 'fs');
    if (needs_web) categories.push('web');
    if (intent === 'system') categories.push('system');
    if (categories.length === 0) categories.push('general');

    return {
      intent,
      complexity,
      categories: Array.from(new Set(categories)),
      needs_code,
      needs_web,
      needs_office,
      privacy,
      confidence,
      reasoning: `Classified by ${this.model} (CPU)`,
      source: 'llm',
    };
  }
}
