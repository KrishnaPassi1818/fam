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

export interface OllamaAdapterOptions {
  host?: string;
  model: string;
  caps?: Partial<ModelCaps>;
  numCtx?: number;
  numGpu?: number;
  keepAlive?: string;
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: Array<{
    id?: string;
    function: {
      name: string;
      arguments: Record<string, unknown> | string;
    };
  }>;
}

interface OllamaToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export class OllamaAdapter implements ModelAdapter {
  public readonly id: string;
  public readonly caps: ModelCaps;
  private readonly host: string;
  private readonly modelName: string;
  private readonly defaultNumCtx: number;
  private readonly numGpu?: number;
  private readonly keepAlive: string;
  private callCounter = 0;

  constructor(options: OllamaAdapterOptions) {
    this.host = options.host || process.env['HX_OLLAMA_HOST'] || 'http://127.0.0.1:11434';
    this.modelName = options.model;
    this.id = `ollama:${options.model}`;
    this.defaultNumCtx = options.numCtx || 8192;
    this.numGpu = options.numGpu;
    this.keepAlive = options.keepAlive || '10m';

    this.caps = {
      tools: options.caps?.tools ?? true,
      parallelTools: options.caps?.parallelTools ?? false,
      vision: options.caps?.vision ?? false,
      jsonSchemaFormat: options.caps?.jsonSchemaFormat ?? true,
      maxCtx: options.caps?.maxCtx ?? this.defaultNumCtx,
    };
  }

  private convertMessages(messages: Message[]): OllamaMessage[] {
    return messages.map((msg) => {
      if (msg.role === 'system') {
        return { role: 'system', content: msg.content };
      }
      if (msg.role === 'user') {
        const images: string[] = [];
        if (msg.parts) {
          for (const p of msg.parts) {
            if (p.type === 'image') {
              images.push(p.data);
            }
          }
        }
        return {
          role: 'user',
          content: msg.content,
          ...(images.length > 0 ? { images } : {}),
        };
      }
      if (msg.role === 'assistant') {
        const toolCalls = msg.toolCalls?.map((tc) => ({
          id: tc.id,
          function: {
            name: tc.name,
            arguments: tc.args,
          },
        }));
        return {
          role: 'assistant',
          content: msg.content || '',
          ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        };
      }
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content: msg.content,
        };
      }
      return { role: 'user', content: '' };
    });
  }

  private convertTools(tools?: ToolDescriptor[]): OllamaToolDefinition[] | undefined {
    if (!tools || tools.length === 0 || !this.caps.tools) return undefined;
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.alias,
        description: t.shortDescription || t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  /**
   * Fallback parser for models that output tool calls in markdown or json format.
   */
  public parseFallbackToolCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = [];
    const trimmed = text.trim();

    // Check for ```json ... ``` blocks
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const candidate = codeBlockMatch && codeBlockMatch[1] ? codeBlockMatch[1].trim() : trimmed;

    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.name === 'string' && parsed.args && typeof parsed.args === 'object') {
          calls.push({
            id: `call_${++this.callCounter}_${Date.now().toString(36)}`,
            name: parsed.name,
            args: parsed.args,
          });
        } else if (typeof parsed.tool === 'string' && parsed.arguments && typeof parsed.arguments === 'object') {
          calls.push({
            id: `call_${++this.callCounter}_${Date.now().toString(36)}`,
            name: parsed.tool,
            args: parsed.arguments,
          });
        } else if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item === 'object' && typeof item.name === 'string') {
              calls.push({
                id: `call_${++this.callCounter}_${Date.now().toString(36)}`,
                name: item.name,
                args: item.args || item.arguments || {},
              });
            }
          }
        }
      }
    } catch {
      // Not a valid fallback JSON tool call
    }
    return calls;
  }

  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk> {
    const endpoint = `${this.host}/api/chat`;
    const ollamaMessages = this.convertMessages(req.messages);
    const ollamaTools = this.convertTools(req.tools);

    const bodyPayload: Record<string, unknown> = {
      model: this.modelName,
      messages: ollamaMessages,
      stream: true,
      keep_alive: this.keepAlive,
      options: {
        num_ctx: req.numCtx || this.defaultNumCtx,
        ...(this.numGpu !== undefined ? { num_gpu: this.numGpu } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      },
    };

    if (ollamaTools) {
      bodyPayload['tools'] = ollamaTools;
    }

    if (req.jsonSchema && this.caps.jsonSchemaFormat) {
      bodyPayload['format'] = req.jsonSchema;
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) {
        throw new ModelError('Request aborted by user', { isTimeout: false, details: err });
      }
      throw new ModelError(`Failed to connect to Ollama at ${endpoint}: ${err instanceof Error ? err.message : String(err)}`, {
        details: err,
      });
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const isOom = errText.toLowerCase().includes('out of memory') || response.status === 507;
      throw new ModelError(
        `Ollama returned HTTP ${response.status}: ${errText}`,
        { isOom, details: { status: response.status, body: errText } },
      );
    }

    if (!response.body) {
      throw new ModelError('Ollama response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(trimmed) as Record<string, unknown>;
          } catch {
            continue;
          }

          const message = parsed['message'] as {
            content?: string;
            tool_calls?: Array<{
              id?: string;
              function: { name: string; arguments: Record<string, unknown> | string };
            }>;
          } | undefined;

          const delta = message?.content || '';
          accumulatedText += delta;

          const toolCalls: ToolCall[] = [];
          if (message?.tool_calls && message.tool_calls.length > 0) {
            for (const tc of message.tool_calls) {
              const callId = tc.id || `call_${++this.callCounter}_${Date.now().toString(36)}`;
              let parsedArgs = tc.function.arguments;
              if (typeof parsedArgs === 'string') {
                try {
                  parsedArgs = JSON.parse(parsedArgs);
                } catch {
                  parsedArgs = { raw: parsedArgs };
                }
              }
              toolCalls.push({
                id: callId,
                name: tc.function.name,
                args: parsedArgs as Record<string, unknown>,
              });
            }
          }

          const isDone = Boolean(parsed['done']);
          let usage = undefined;
          if (isDone) {
            const promptEval = Number(parsed['prompt_eval_count'] || 0);
            const evalCount = Number(parsed['eval_count'] || 0);
            usage = {
              promptTokens: promptEval,
              completionTokens: evalCount,
              totalTokens: promptEval + evalCount,
            };
          }

          let finishReason: ChatChunk['finishReason'] = undefined;
          if (isDone) {
            if (toolCalls.length > 0) {
              finishReason = 'tool_calls';
            } else {
              finishReason = (parsed['done_reason'] as ChatChunk['finishReason']) || 'stop';
            }
          }

          yield {
            delta,
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
            ...(usage ? { usage } : {}),
            ...(finishReason ? { finishReason } : {}),
          };
        }
      }

      // Check fallback tool calls if no native tool calls were received and output looks like a call
      if (accumulatedText.length > 0 && !this.caps.tools) {
        const fallbacks = this.parseFallbackToolCalls(accumulatedText);
        if (fallbacks.length > 0) {
          yield {
            delta: '',
            toolCalls: fallbacks,
            finishReason: 'tool_calls',
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  countTokens(messages: Message[]): number {
    return estimateMessageTokens(messages);
  }

  async warm(): Promise<void> {
    try {
      await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt: '',
          keep_alive: this.keepAlive,
        }),
      });
    } catch {
      // Best-effort warm
    }
  }

  async unload(): Promise<void> {
    try {
      await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt: '',
          keep_alive: 0,
        }),
      });
    } catch {
      // Best-effort unload
    }
  }
}
