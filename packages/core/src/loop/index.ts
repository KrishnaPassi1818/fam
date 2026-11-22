import {
  type ModelAdapter,
  type Message,
  type ToolCall,
  type ToolResult,
  type ToolDescriptor,
  LoopDetected,
  BudgetExceeded,
  ModelError,
} from '@hx/shared';
import { PromptBuilder, type BuildPromptOptions } from '../prompts/builder.js';
import { Tracer } from '../trace/index.js';

export interface ToolExecutionHandler {
  (args: Record<string, unknown>, signal?: AbortSignal): Promise<{
    content: string;
    isError?: boolean;
  }>;
}

export interface AgentLoopOptions {
  adapter: ModelAdapter;
  promptBuilder?: PromptBuilder;
  tracer?: Tracer;
  role?: 'assistant' | 'coder' | 'router';
  tier?: 'full' | 'medium' | 'min';
  userGlobalPrompt?: string;
  projectPrompt?: string;
  tools?: ToolDescriptor[];
  toolHandlers?: Record<string, ToolExecutionHandler>;
  maxSteps?: number;
  maxTokens?: number;
  maxWallMs?: number;
  repetitionThreshold?: number;
}

export type AgentLoopEvent =
  | { type: 'chunk'; delta: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'tool_result'; toolResult: ToolResult }
  | { type: 'warning'; message: string }
  | { type: 'finish'; response: string; steps: number; totalTokens: number };

// Built-in tools for v1
export const BUILTIN_TOOLS: ToolDescriptor[] = [
  {
    name: 'echo',
    alias: 'echo',
    description: 'Echo back input message.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    category: 'built-in',
    tier: 0,
    timeoutMs: 5000,
  },
  {
    name: 'current_time',
    alias: 'current_time',
    description: 'Get current system time and date in ISO format.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    category: 'built-in',
    tier: 0,
    timeoutMs: 5000,
  },
];

export const BUILTIN_TOOL_HANDLERS: Record<string, ToolExecutionHandler> = {
  echo: async (args) => ({
    content: String(args['message'] || ''),
    isError: false,
  }),
  current_time: async () => ({
    content: new Date().toISOString(),
    isError: false,
  }),
};

export class AgentLoop {
  private readonly adapter: ModelAdapter;
  private readonly promptBuilder: PromptBuilder;
  private readonly tracer?: Tracer;
  private readonly role: 'assistant' | 'coder' | 'router';
  private readonly tier?: 'full' | 'medium' | 'min';
  private readonly userGlobalPrompt?: string;
  private readonly projectPrompt?: string;
  private readonly tools: ToolDescriptor[];
  private readonly toolHandlers: Record<string, ToolExecutionHandler>;
  private readonly maxSteps: number;
  private readonly maxTokens: number;
  private readonly maxWallMs: number;
  private readonly repetitionThreshold: number;

  constructor(options: AgentLoopOptions) {
    this.adapter = options.adapter;
    this.promptBuilder = options.promptBuilder || new PromptBuilder();
    this.tracer = options.tracer;
    this.role = options.role || 'assistant';
    this.tier = options.tier;
    this.userGlobalPrompt = options.userGlobalPrompt;
    this.projectPrompt = options.projectPrompt;
    this.tools = [...BUILTIN_TOOLS, ...(options.tools || [])];
    this.toolHandlers = { ...BUILTIN_TOOL_HANDLERS, ...(options.toolHandlers || {}) };
    this.maxSteps = options.maxSteps ?? 30;
    this.maxTokens = options.maxTokens ?? 100000;
    this.maxWallMs = options.maxWallMs ?? 300000;
    this.repetitionThreshold = options.repetitionThreshold ?? 3;
  }

  private hashCall(toolName: string, args: Record<string, unknown>): string {
    const sorted = Object.keys(args)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = args[key];
        return acc;
      }, {});
    return `${toolName}:${JSON.stringify(sorted)}`;
  }

  async *run(initialMessages: Message[], signal?: AbortSignal): AsyncIterable<AgentLoopEvent> {
    const history: Message[] = [...initialMessages];
    const callCounts = new Map<string, number>();
    const startTime = Date.now();
    let totalTokensUsed = 0;
    let step = 0;

    this.tracer?.emit('session_start', {
      cwd: process.cwd(),
      role: this.role,
      tier: this.tier,
      model: this.adapter.id,
    });

    try {
      while (step < this.maxSteps) {
        step++;

        // Guard 1: Wall time limit
        const elapsedMs = Date.now() - startTime;
        if (elapsedMs > this.maxWallMs) {
          throw new BudgetExceeded(elapsedMs, this.maxWallMs);
        }

        // Guard 2: Abort signal
        if (signal?.aborted) {
          throw new ModelError('Agent loop interrupted by abort signal');
        }

        // Build layered prompt
        const promptParams: BuildPromptOptions = {
          modelId: this.adapter.id,
          role: this.role,
          tier: this.tier,
          userGlobalPrompt: this.userGlobalPrompt,
          projectPrompt: this.projectPrompt,
          dynamicContext: {
            date: new Date().toISOString(),
            cwd: process.cwd(),
          },
        };
        const builtPrompt = this.promptBuilder.build(promptParams);

        this.tracer?.emit('prompt', {
          step,
          systemPrompt: builtPrompt.systemPrompt,
          tokenCount: builtPrompt.totalTokens,
          layersIncluded: builtPrompt.layers.filter((l) => !l.dropped).map((l) => l.name),
        });

        // Check cumulative token count
        const turnTokens = this.adapter.countTokens(history);
        const estimatedTurn = typeof turnTokens === 'number' ? turnTokens : await turnTokens;
        totalTokensUsed += estimatedTurn;
        if (totalTokensUsed > this.maxTokens) {
          throw new BudgetExceeded(totalTokensUsed, this.maxTokens);
        }

        // Prepare request with system message at index 0 if not present
        const messagesToSend: Message[] = [
          { role: 'system', content: builtPrompt.systemPrompt },
          ...history.filter((m) => m.role !== 'system'),
        ];

        this.tracer?.emit('model_call', {
          step,
          modelId: this.adapter.id,
          messagesCount: messagesToSend.length,
          toolsCount: this.tools.length,
        });

        // Stream model response
        let turnResponse = '';
        const turnToolCalls: ToolCall[] = [];

        for await (const chunk of this.adapter.chat(
          {
            messages: messagesToSend,
            tools: this.tools,
            systemPrompt: builtPrompt.systemPrompt,
          },
          signal,
        )) {
          if (signal?.aborted) {
            throw new ModelError('Agent loop interrupted by abort signal');
          }
          if (chunk.delta) {
            turnResponse += chunk.delta;
            if (this.tracer?.recordChunks) {
              this.tracer.emit('model_chunk', { step, delta: chunk.delta });
            }
            yield { type: 'chunk', delta: chunk.delta };
          }
          if (chunk.toolCalls && chunk.toolCalls.length > 0) {
            turnToolCalls.push(...chunk.toolCalls);
          }
        }

        if (signal?.aborted) {
          throw new ModelError('Agent loop interrupted by abort signal');
        }

        // If no tool calls, response is complete
        if (turnToolCalls.length === 0) {
          history.push({ role: 'assistant', content: turnResponse });
          this.tracer?.emit('session_end', {
            step,
            totalTokens: totalTokensUsed,
            durationMs: Date.now() - startTime,
          });
          yield {
            type: 'finish',
            response: turnResponse,
            steps: step,
            totalTokens: totalTokensUsed,
          };
          return;
        }

        // Append assistant message with tool calls to history
        history.push({
          role: 'assistant',
          content: turnResponse,
          toolCalls: turnToolCalls,
        });

        // Execute tool calls sequentially
        for (const call of turnToolCalls) {
          if (signal?.aborted) {
            throw new ModelError('Agent loop interrupted by abort signal');
          }

          this.tracer?.emit('tool_call', {
            step,
            callId: call.id,
            name: call.name,
            args: call.args,
          });

          yield { type: 'tool_call', toolCall: call };

          // Guard 3: Repetition loop detector
          const callHash = this.hashCall(call.name, call.args);
          const count = (callCounts.get(callHash) || 0) + 1;
          callCounts.set(callHash, count);

          if (count >= this.repetitionThreshold + 1) {
            throw new LoopDetected(call.name, count);
          }

          if (count === this.repetitionThreshold) {
            this.tracer?.emit('loop_warning', {
              step,
              tool: call.name,
              count,
            });
            yield {
              type: 'warning',
              message: `Repetition detected: ${call.name} has been invoked ${count} times with identical arguments.`,
            };
            history.push({
              role: 'user',
              content: `Notice: You have invoked tool ${call.name} with identical arguments multiple times without progressing. Please modify your plan or provide a conclusion.`,
            });
          }

          // Execute tool handler
          const handler = this.toolHandlers[call.name];
          let toolResult: ToolResult;

          if (!handler) {
            toolResult = {
              callId: call.id,
              name: call.name,
              content: `Error: Tool '${call.name}' not found. Available tools: ${Object.keys(this.toolHandlers).join(', ')}`,
              isError: true,
            };
          } else {
            try {
              const out = await handler(call.args, signal);
              toolResult = {
                callId: call.id,
                name: call.name,
                content: out.content,
                isError: out.isError ?? false,
              };
            } catch (err) {
              toolResult = {
                callId: call.id,
                name: call.name,
                content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
                isError: true,
              };
            }
          }

          this.tracer?.emit('tool_result', {
            step,
            callId: toolResult.callId,
            name: toolResult.name,
            isError: toolResult.isError,
            content: toolResult.content,
          });

          yield { type: 'tool_result', toolResult };

          history.push({
            role: 'tool',
            callId: toolResult.callId,
            name: toolResult.name,
            content: toolResult.content,
            isError: toolResult.isError,
          });
        }
      }

      // Exceeded maxSteps
      throw new BudgetExceeded(step, this.maxSteps);
    } catch (err) {
      this.tracer?.emit('error', {
        step,
        error: err instanceof Error ? err.message : String(err),
        type: err?.constructor?.name || 'Error',
      });
      throw err;
    }
  }
}
