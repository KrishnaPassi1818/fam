import { GoogleGenAI } from '@google/genai';
import {
  type ModelAdapter,
  type ModelCaps,
  type ChatRequest,
  type ChatChunk,
  type Message,
  type ToolCall,
  type ToolDescriptor,
  ModelError,
  estimateMessageTokens,
} from '@hx/shared';
import { PrivacyGate } from '../privacy/index.js';

export interface GeminiAdapterOptions {
  apiKey?: string;
  model: string;
  caps?: Partial<ModelCaps>;
  requestsPerMinute?: number;
  maxRetries?: number;
  privacyGate?: PrivacyGate;
}

export class GeminiRateLimiter {
  private lastRequestTime = 0;
  private readonly minIntervalMs: number;

  constructor(requestsPerMinute = 15) {
    this.minIntervalMs = Math.ceil(60000 / requestsPerMinute);
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - elapsed;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, waitTime);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new ModelError('Request aborted while waiting for rate limit'));
          });
        }
      });
    }
    this.lastRequestTime = Date.now();
  }
}

export class GeminiAdapter implements ModelAdapter {
  public readonly id: string;
  public readonly caps: ModelCaps;
  private readonly client: GoogleGenAI;
  private readonly modelName: string;
  private readonly rateLimiter: GeminiRateLimiter;
  private readonly maxRetries: number;
  private readonly privacyGate?: PrivacyGate;
  private callCounter = 0;

  constructor(options: GeminiAdapterOptions) {
    const key = options.apiKey || process.env['GEMINI_API_KEY'] || '';
    this.client = new GoogleGenAI({ apiKey: key });
    const cleanModel = options.model.replace(/^gemini:/, '');
    this.modelName = cleanModel;
    this.id = `gemini:${cleanModel}`;
    this.rateLimiter = new GeminiRateLimiter(options.requestsPerMinute || 15);
    this.maxRetries = options.maxRetries ?? 3;
    this.privacyGate = options.privacyGate;

    this.caps = {
      tools: options.caps?.tools ?? true,
      parallelTools: options.caps?.parallelTools ?? true,
      vision: options.caps?.vision ?? true,
      jsonSchemaFormat: options.caps?.jsonSchemaFormat ?? true,
      maxCtx: options.caps?.maxCtx ?? 1048576,
    };
  }

  // Exposed for testing/mocking
  public getClient(): GoogleGenAI {
    return this.client;
  }

  private convertMessages(messages: Message[]): {
    systemInstruction?: string;
    contents: Array<{ role: string; parts: unknown[] }>;
  } {
    let systemInstruction: string | undefined = undefined;
    const contents: Array<{ role: string; parts: unknown[] }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
        continue;
      }

      if (msg.role === 'user') {
        const parts: unknown[] = [];
        if (msg.parts && msg.parts.length > 0) {
          for (const p of msg.parts) {
            if (p.type === 'text') {
              parts.push({ text: p.text });
            } else if (p.type === 'image') {
              parts.push({
                inlineData: {
                  mimeType: p.mimeType,
                  data: p.data,
                },
              });
            }
          }
        } else {
          parts.push({ text: msg.content });
        }
        contents.push({ role: 'user', parts });
        continue;
      }

      if (msg.role === 'assistant') {
        const parts: unknown[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.args,
              },
            });
          }
        }
        contents.push({ role: 'model', parts });
        continue;
      }

      if (msg.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.name,
                response: {
                  output: msg.content,
                  isError: msg.isError,
                },
              },
            },
          ],
        });
        continue;
      }
    }

    return { systemInstruction, contents };
  }

  private convertTools(tools?: ToolDescriptor[]): unknown[] | undefined {
    if (!tools || tools.length === 0 || !this.caps.tools) return undefined;

    const declarations = tools.map((t) => ({
      name: t.alias,
      description: t.shortDescription || t.description,
      parameters: t.inputSchema,
    }));

    return [{ functionDeclarations: declarations }];
  }

  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk> {
    if (this.privacyGate) {
      this.privacyGate.enforce(req.messages);
    }

    await this.rateLimiter.acquire(signal);

    const { systemInstruction, contents } = this.convertMessages(req.messages);
    const finalSystemPrompt = req.systemPrompt || systemInstruction;
    const tools = this.convertTools(req.tools);

    const config: Record<string, unknown> = {};
    if (finalSystemPrompt) config['systemInstruction'] = finalSystemPrompt;
    if (tools) config['tools'] = tools;
    if (req.temperature !== undefined) config['temperature'] = req.temperature;

    let attempt = 0;
    while (true) {
      if (signal?.aborted) {
        throw new ModelError('Request aborted by user');
      }

      try {
        const responseStream = await this.client.models.generateContentStream({
          model: this.modelName,
          contents: contents as unknown as Parameters<typeof this.client.models.generateContentStream>[0]['contents'],
          config: config as unknown as Parameters<typeof this.client.models.generateContentStream>[0]['config'],
        });

        for await (const chunk of responseStream) {
          if (signal?.aborted) {
            throw new ModelError('Request aborted by user');
          }

          const delta = chunk.text || '';
          const toolCalls: ToolCall[] = [];

          if (chunk.functionCalls && chunk.functionCalls.length > 0) {
            for (const fc of chunk.functionCalls) {
              toolCalls.push({
                id: `call_${++this.callCounter}_${Date.now().toString(36)}`,
                name: fc.name || '',
                args: (fc.args as Record<string, unknown>) || {},
              });
            }
          }

          const usage = chunk.usageMetadata
            ? {
                promptTokens: chunk.usageMetadata.promptTokenCount,
                completionTokens: chunk.usageMetadata.candidatesTokenCount,
                totalTokens: chunk.usageMetadata.totalTokenCount,
              }
            : undefined;

          yield {
            delta,
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
            ...(usage ? { usage } : {}),
            finishReason: toolCalls.length > 0 ? 'tool_calls' : undefined,
          };
        }
        return;
      } catch (err: unknown) {
        const errMessage = String(err);
        const isRateLimit = errMessage.includes('429') || errMessage.includes('RESOURCE_EXHAUSTED');

        if (isRateLimit && attempt < this.maxRetries) {
          attempt++;
          const backoffMs = Math.min(30000, 1000 * Math.pow(2, attempt) + Math.random() * 500);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        throw new ModelError(`Gemini API error: ${errMessage}`, {
          isRateLimit,
          details: err,
        });
      }
    }
  }

  async countTokens(messages: Message[]): Promise<number> {
    try {
      const { contents } = this.convertMessages(messages);
      const res = await this.client.models.countTokens({
        model: this.modelName,
        contents: contents as unknown as Parameters<typeof this.client.models.countTokens>[0]['contents'],
      });
      if (res.totalTokens !== undefined) {
        return res.totalTokens;
      }
    } catch {
      // Fallback to local estimator if API call fails
    }
    return estimateMessageTokens(messages);
  }
}
