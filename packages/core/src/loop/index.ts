import {
  type ModelAdapter,
  type Message,
  type ToolCall,
  type ToolResult,
  type ToolDescriptor,
  type ExecutionPlan,
  type NormalizedToolResult,
  LoopDetected,
  BudgetExceeded,
  ModelError,
} from '@fam/shared';
import { PromptBuilder, type BuildPromptOptions } from '../prompts/builder.js';
import { Tracer } from '../trace/index.js';
import { ToolExecutor, type ToolHandler } from '../tools/executor.js';
import { PermissionGate, type PermissionCheckResult } from '../tools/permission.js';
import { ContextManager } from '../context/index.js';
import { evaluateMathExpression } from '../tools/math.js';
import {
  MemoryService,
  REMEMBER_DESCRIPTOR,
  TODO_DESCRIPTOR,
  SCRATCH_DESCRIPTOR,
  handleRemember,
  handleTodo,
  handleScratch,
  TodoManager,
  Scratchpad,
} from '../memory/index.js';
import { ToolRetriever } from '../tools/retriever.js';
import { FIND_TOOLS_DESCRIPTOR, handleFindTools } from '../tools/meta/find-tools.js';
import { matchFastPath, fallbackClassification } from '../router/rules.js';
import { AgentStateMachine, type AgentExecutionState } from './state-machine.js';
import { BackupService } from '../backup/index.js';
import { TaskPlanner } from './planner.js';

export * from './state-machine.js';
export * from './planner.js';
export * from './reasoning.js';

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
  contextManager?: ContextManager;
  memoryService?: MemoryService;
  retriever?: ToolRetriever;
  role?: 'assistant' | 'coder' | 'router';
  tier?: 'full' | 'medium' | 'min';
  userGlobalPrompt?: string;
  projectPrompt?: string;
  tools?: ToolDescriptor[];
  toolHandlers?: Record<string, ToolExecutionHandler>;
  executor?: ToolExecutor;
  permissionGate?: PermissionGate;
  backupService?: BackupService;
  browserStateProvider?: () => Promise<{ tabId?: string; title?: string; url?: string; elementCount?: number } | string | undefined> | { tabId?: string; title?: string; url?: string; elementCount?: number } | string | undefined;
  onPermissionRequired?: (
    toolCall: ToolCall,
    check: PermissionCheckResult,
  ) => Promise<boolean>;
  maxSteps?: number;
  maxTokens?: number;
  maxWallMs?: number;
  repetitionThreshold?: number;
}

export type AgentLoopEvent =
  | { type: 'chunk'; delta: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'tool_result'; toolResult: ToolResult }
  | { type: 'plan'; plan: ExecutionPlan }
  | { type: 'warning'; message: string }
  | { type: 'state_change'; state: AgentExecutionState; previousState: AgentExecutionState; detail?: string }
  | { type: 'finish'; response: string; steps: number; totalTokens: number };

// Built-in tools for v1
export const BUILTIN_TOOLS: ToolDescriptor[] = [
  {
    name: 'echo',
    alias: 'echo',
    description:
      'Internal diagnostic tool for connectivity testing ONLY. NEVER call this tool for logging, printing, status, or normal conversation.',
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
  {
    name: 'math',
    alias: 'math',
    description: 'Evaluate mathematical calculations, sums, averages, percentages, discounts, and multi-step formulas with variables (e.g. "total = 250+450+120+800+380; avg = total/5; discount = total*0.12; net = total - discount").',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Math expression or semicolon-separated formulas to evaluate, e.g. "250 + 450 + 120 + 800 + 380" or "total = 2000; discount = total * 0.12; net = total - discount"',
        },
      },
      required: ['expression'],
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
  math: async (args) => {
    try {
      const expr = String(args['expression'] || '');
      const evalRes = evaluateMathExpression(expr);
      let output = `Expression: ${evalRes.expression}\nResult: ${evalRes.result}\nFormatted: ${evalRes.formatted}`;
      if (evalRes.lines && evalRes.lines.length > 1) {
        output +=
          '\nCalculations:\n' +
          evalRes.lines
            .map((l) => `• ${l.name ? l.name + ' = ' : ''}${l.expression} -> ${l.formatted}`)
            .join('\n');
      }
      return {
        content: output,
        isError: false,
      };
    } catch (err) {
      return {
        content: `Math evaluation error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

export class AgentLoop {
  private readonly adapter: ModelAdapter;
  private readonly promptBuilder: PromptBuilder;
  private readonly tracer?: Tracer;
  private readonly memoryService?: MemoryService;
  private readonly todoManager: TodoManager;
  private readonly scratchpad: Scratchpad;
  private readonly role: 'assistant' | 'coder' | 'router';
  private readonly tier?: 'full' | 'medium' | 'min';
  private readonly userGlobalPrompt?: string;
  private readonly projectPrompt?: string;
  private readonly tools: ToolDescriptor[];
  private readonly toolHandlers: Record<string, ToolExecutionHandler>;
  private readonly retriever: ToolRetriever;
  private readonly executor: ToolExecutor;
  private readonly contextManager: ContextManager;
  private readonly descriptorMap: Map<string, ToolDescriptor>;
  private readonly handlerMap: Map<string, ToolHandler>;
  private readonly maxSteps: number;
  private readonly maxTokens: number;
  private readonly maxWallMs: number;
  private readonly repetitionThreshold: number;
  private readonly stateMachine: AgentStateMachine;
  private readonly backupService: BackupService;
  private readonly browserStateProvider?: () => Promise<{ tabId?: string; title?: string; url?: string; elementCount?: number } | string | undefined> | { tabId?: string; title?: string; url?: string; elementCount?: number } | string | undefined;

  constructor(options: AgentLoopOptions) {
    this.stateMachine = new AgentStateMachine();
    this.backupService = options.backupService || new BackupService();
    this.browserStateProvider = options.browserStateProvider;
    this.adapter = options.adapter;
    this.promptBuilder = options.promptBuilder || new PromptBuilder();
    this.tracer = options.tracer;
    this.memoryService = options.memoryService;
    this.todoManager = new TodoManager();
    this.scratchpad = new Scratchpad();
    this.contextManager =
      options.contextManager || new ContextManager({ modelId: this.adapter.id });
    this.role = options.role || 'assistant';
    this.tier = options.tier;
    this.userGlobalPrompt = options.userGlobalPrompt;
    this.projectPrompt = options.projectPrompt;

    const blobTools = this.contextManager.getBlobStore().getTools();
    const blobHandlers = this.contextManager.getBlobStore().getHandlers();

    const memTools: ToolDescriptor[] = this.memoryService
      ? [
          { ...REMEMBER_DESCRIPTOR, name: 'remember', alias: 'remember' },
          { ...TODO_DESCRIPTOR, name: 'todo', alias: 'todo' },
          { ...SCRATCH_DESCRIPTOR, name: 'scratch', alias: 'scratch' },
        ]
      : [];

    const memHandlers: Record<string, ToolExecutionHandler> = this.memoryService
      ? {
          remember: async (args) => ({
            content: await handleRemember(this.memoryService!, args as { text: string }),
            isError: false,
          }),
          todo: async (args) => ({
            content: handleTodo(this.todoManager, args as { action: 'add' | 'done' | 'list' | 'clear' }),
            isError: false,
          }),
          scratch: async (args) => ({
            content: handleScratch(this.scratchpad, args as { action: 'set' | 'get' | 'append'; key: string }),
            isError: false,
          }),
        }
      : {};

    const metaTools: ToolDescriptor[] = [FIND_TOOLS_DESCRIPTOR];
    const metaHandlers: Record<string, ToolExecutionHandler> = {
      find_tools: async (args) => ({
        content: await handleFindTools(this.retriever, args as { query: string; category?: string }),
        isError: false,
      }),
      'core.find_tools': async (args) => ({
        content: await handleFindTools(this.retriever, args as { query: string; category?: string }),
        isError: false,
      }),
    };

    this.tools = [...BUILTIN_TOOLS, ...metaTools, ...blobTools, ...memTools, ...(options.tools || [])];
    this.toolHandlers = {
      ...BUILTIN_TOOL_HANDLERS,
      ...metaHandlers,
      ...blobHandlers,
      ...memHandlers,
      ...(options.toolHandlers || {}),
    };

    this.retriever =
      options.retriever ||
      new ToolRetriever({
        defaultTopK: 10,
        coreToolNames: ['math', 'find_tools', 'core.find_tools', 'remember'],
      });

    for (const t of this.tools) {
      this.retriever.registerTool(t);
    }

    this.descriptorMap = new Map();
    this.handlerMap = new Map(Object.entries(this.toolHandlers));

    for (const t of this.tools) {
      this.descriptorMap.set(t.name, t);
      if (t.alias) this.descriptorMap.set(t.alias, t);

      // Support short names without prefixes (e.g. sandbox_run_command -> run_command)
      const dotParts = t.name.split('.');
      const underParts = t.name.split('_');
      const shortDot = dotParts.length > 1 ? dotParts.slice(1).join('.') : undefined;
      const shortUnder = underParts.length > 1 ? underParts.slice(1).join('_') : undefined;

      const handler = this.toolHandlers[t.name] || (t.alias ? this.toolHandlers[t.alias] : undefined);
      if (shortDot) {
        if (!this.descriptorMap.has(shortDot)) this.descriptorMap.set(shortDot, t);
        if (handler && !this.handlerMap.has(shortDot)) this.handlerMap.set(shortDot, handler);
      }
      if (shortUnder) {
        if (!this.descriptorMap.has(shortUnder)) this.descriptorMap.set(shortUnder, t);
        if (handler && !this.handlerMap.has(shortUnder)) this.handlerMap.set(shortUnder, handler);
      }
    }

    this.executor =
      options.executor ||
      new ToolExecutor({
        permissionGate: options.permissionGate,
        backupService: this.backupService,
        onPermissionRequired: options.onPermissionRequired,
      });

    this.maxSteps = options.maxSteps ?? 30;
    this.maxTokens = options.maxTokens ?? 100000;
    this.maxWallMs = options.maxWallMs ?? 600000;
    this.repetitionThreshold = options.repetitionThreshold ?? 3;
  }

  public getStateMachine(): AgentStateMachine {
    return this.stateMachine;
  }

  public getState(): AgentExecutionState {
    return this.stateMachine.getState();
  }

  public getBackupService(): BackupService {
    return this.backupService;
  }

  private *transitionState(
    target: AgentExecutionState,
    detail?: string,
  ): Generator<AgentLoopEvent> {
    const prev = this.stateMachine.getState();
    if (prev !== target) {
      this.stateMachine.transition(target, detail);
      this.tracer?.emit('state_change', { from: prev, to: target, detail });
      yield { type: 'state_change', state: target, previousState: prev, detail };
    }
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
    let consecutiveErrorTurns = 0;
    let replanAttempts = 0;

    const userMsgs = history.filter((m) => m.role === 'user');
    const lastUserMsg = userMsgs[userMsgs.length - 1];
    const userPrompt = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';

    const taskCtx = this.contextManager.getTaskContextManager().createTask(userPrompt, process.cwd());
    const taskId = taskCtx.taskId;

    const isComplex = TaskPlanner.isComplexTask(userPrompt);
    const plan = isComplex ? TaskPlanner.generatePlan(taskId, userPrompt) : null;
    if (plan) {
      taskCtx.setPlan(plan);
      yield { type: 'plan', plan };
      this.tracer?.emit('plan', { taskId, plan });
    }

    const taskExecutedResults: NormalizedToolResult[] = [];

    this.tracer?.emit('session_start', {
      cwd: process.cwd(),
      role: this.role,
      tier: this.tier,
      model: this.adapter.id,
      taskId,
    });
    yield* this.transitionState('UNDERSTANDING', 'Processing user objective');

    try {
      while (step < this.maxSteps) {
        step++;

        yield* this.transitionState('PLANNING', 'Synthesizing context and prompt layers');
        yield* this.transitionState('TOOL_SELECTION', 'Selecting candidate tools');

        // Guard 1: Wall time limit
        const elapsedMs = Date.now() - startTime;
        if (elapsedMs > this.maxWallMs) {
          throw new ModelError(`Wall clock timeout: ${Math.round(elapsedMs / 1000)}s exceeded limit of ${Math.round(this.maxWallMs / 1000)}s`, { isTimeout: true });
        }

        // Guard 2: Abort signal
        if (signal?.aborted) {
          throw new ModelError('Agent loop interrupted by abort signal');
        }

        // Retrieve relevant memory if memoryService is active
        let retrievedMemories: string[] = [];
        if (this.memoryService) {
          const userMsgs = history.filter((m) => m.role === 'user');
          const lastUser = userMsgs[userMsgs.length - 1];
          if (lastUser && typeof lastUser.content === 'string') {
            try {
              const mems = await this.memoryService.retrieve(lastUser.content, { maxTokens: 400 });
              retrievedMemories = mems.map((m) => m.memory.text);
            } catch {
              // Best effort
            }
          }
        }

        // Retrieve active browser context if browserStateProvider is configured
        let activeBrowserState: { tabId?: string; title?: string; url?: string; elementCount?: number } | string | undefined;
        if (this.browserStateProvider) {
          try {
            activeBrowserState = await this.browserStateProvider();
          } catch {
            // Best effort
          }
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
            memories: retrievedMemories,
            browserState: activeBrowserState,
          },
        };
        const builtPrompt = this.promptBuilder.build(promptParams);

        this.tracer?.emit('prompt', {
          step,
          systemPrompt: builtPrompt.systemPrompt,
          tokenCount: builtPrompt.totalTokens,
          layersIncluded: builtPrompt.layers.filter((l) => !l.dropped).map((l) => l.name),
        });

        // Filter active tools dynamically using ToolRetriever if total registered tools exceed 8
        let candidateTools: ToolDescriptor[];
        if (this.tools.length > 8) {
          const userMsgs = history.filter((m) => m.role === 'user');
          const lastUser = userMsgs[userMsgs.length - 1];
          const query = typeof lastUser?.content === 'string' ? lastUser.content : '';
          const routerContext = matchFastPath(query) || fallbackClassification(query);
          candidateTools = await this.retriever.retrieve(query, routerContext);
        } else {
          candidateTools = [...this.tools];
        }

        // Gate blob tools dynamically so they only appear when blobs actually exist
        const hasBlobs = this.contextManager.getBlobStore().hasBlobs();
        const activeTools = candidateTools.filter((t) => {
          const isBlobTool =
            t.name === 'blob_read' ||
            t.name === 'blob_grep' ||
            t.alias === 'blob_read' ||
            t.alias === 'blob_grep' ||
            t.name.endsWith('.blob_read') ||
            t.name.endsWith('.blob_grep');
          if (isBlobTool) {
            return hasBlobs;
          }
          return true;
        });

        // Prepare context through 4-phase ladder (including blob offload for large tool results)
        const prep = await this.contextManager.prepareContext(
          builtPrompt.systemPrompt,
          activeTools,
          history.filter((m) => m.role !== 'system'),
          taskCtx,
        );

        if (prep.appliedStrategies.length > 0) {
          this.tracer?.emit('compact', {
            step,
            appliedStrategies: prep.appliedStrategies,
            historyTokens: prep.accounting.historyTokens,
          });
        }

        // Check cumulative token count on prepared context
        const turnTokens = this.adapter.countTokens(prep.messages);
        const estimatedTurn = typeof turnTokens === 'number' ? turnTokens : await turnTokens;
        totalTokensUsed += estimatedTurn;
        if (totalTokensUsed > this.maxTokens) {
          throw new BudgetExceeded(totalTokensUsed, this.maxTokens);
        }

        // Prepare request with system message at index 0 if not present
        const messagesToSend: Message[] = [
          { role: 'system', content: builtPrompt.systemPrompt },
          ...prep.messages,
        ];

        this.tracer?.emit('model_call', {
          step,
          modelId: this.adapter.id,
          messagesCount: messagesToSend.length,
          toolsCount: activeTools.length,
        });

        // Stream model response
        yield* this.transitionState('REASONING', 'Streaming model response');
        let turnResponse = '';
        const turnToolCalls: ToolCall[] = [];

        for await (const chunk of this.adapter.chat(
          {
            messages: messagesToSend,
            tools: activeTools,
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

        // If no tool calls, verify completion evidence before transitioning to COMPLETED
        if (turnToolCalls.length === 0) {
          const evidence = TaskPlanner.verifyExecutionEvidence(userPrompt, taskExecutedResults);
          if (!evidence.grounded && replanAttempts < 2) {
            replanAttempts++;
            yield* this.transitionState('REPLANNING', 'Execution evidence missing for claimed action');
            history.push({ role: 'assistant', content: turnResponse });
            history.push({
              role: 'user',
              content: `Grounding Notice: Your response claimed completion, but required operations were not executed via tool calls. ${evidence.reason || ''} You must execute the real tools to complete this task.`,
            });
            continue;
          }

          history.push({ role: 'assistant', content: turnResponse });
          taskCtx.completionState = 'COMPLETED';
          this.tracer?.emit('session_end', {
            step,
            totalTokens: totalTokensUsed,
            durationMs: Date.now() - startTime,
            taskId,
          });
          yield* this.transitionState('VERIFYING', 'Verifying final task response');
          yield* this.transitionState('COMPLETED', 'Finished execution');
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

        // 1. Check repetition loop detector & emit tool_call events
        let loopWarningMessage: string | null = null;
        for (const call of turnToolCalls) {
          this.retriever.markToolUsed(call.name);
          const alias = this.descriptorMap.get(call.name)?.alias;
          if (alias) this.retriever.markToolUsed(alias);

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
            loopWarningMessage = `Notice: You have invoked tool ${call.name} with identical arguments multiple times without progressing. Please modify your plan, adjust command arguments/paths, or provide your final response.`;
          }
        }

        // 2. Execute tool calls batch via ToolExecutor
        yield* this.transitionState('EXECUTING', 'Executing tool batch');
        const batchResults = await this.executor.executeBatch(
          turnToolCalls,
          this.descriptorMap,
          this.handlerMap,
          signal,
          taskId,
        );
        yield* this.transitionState('OBSERVING', 'Capturing tool execution results');

        let hasToolError = false;
        let hasFileReadError = false;
        let hasCommandError = false;
        for (const toolResult of batchResults) {
          if (toolResult.normalized) {
            const norm = toolResult.normalized as unknown as NormalizedToolResult;
            taskExecutedResults.push(norm);
            taskCtx.recordToolResult(norm);
          }

          if (toolResult.isError) {
            hasToolError = true;
            if (toolResult.name === 'fs_read_file' || toolResult.name === 'fs_grep') {
              hasFileReadError = true;
            } else if (toolResult.name === 'sandbox_run_command') {
              hasCommandError = true;
            }
          }

          // If a modifying tool succeeded, reset repetition counts because workspace state changed
          const descriptor = this.descriptorMap.get(toolResult.name);
          if (!toolResult.isError && descriptor && !descriptor.annotations?.readOnlyHint) {
            callCounts.clear();
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

          // If browser navigation succeeded, persist episodic memory
          if (!toolResult.isError && this.memoryService && (toolResult.name === 'browser_navigate' || toolResult.name.endsWith('browser_navigate'))) {
            try {
              await this.memoryService.remember({
                text: toolResult.content,
                kind: 'episodic',
                tags: ['browser', 'navigation'],
                source: 'tool',
              });
            } catch {
              // Best effort memory capture
            }
          }
        }

        if (loopWarningMessage) {
          history.push({
            role: 'user',
            content: loopWarningMessage,
          });
        }

        if (hasToolError) {
          yield* this.transitionState('REPLANNING', 'Handling tool execution failure');
          consecutiveErrorTurns++;
          if (consecutiveErrorTurns >= 2) {
            if (hasFileReadError) {
              history.push({
                role: 'user',
                content: 'Notice: Recent file reads failed because the files do not exist yet. If you are creating a new application, please write the necessary source files and tests directly using fs_write_file.',
              });
            } else if (hasCommandError) {
              history.push({
                role: 'user',
                content: 'Notice: Recent command execution failed. Carefully inspect the stdout/stderr traceback above and fix the underlying issue (e.g. test paths, missing __init__.py, or import names) rather than repeating.',
              });
            }
          }
        } else {
          consecutiveErrorTurns = 0;
        }
      }

      // Exceeded maxSteps
      throw new BudgetExceeded(step, this.maxSteps, 'steps');
    } catch (err) {
      if (signal?.aborted) {
        taskCtx.completionState = 'CANCELLED';
        yield* this.transitionState('CANCELLED', 'Aborted by signal');
      } else {
        taskCtx.completionState = 'FAILED';
        yield* this.transitionState('FAILED', err instanceof Error ? err.message : String(err));
      }
      this.tracer?.emit('error', {
        step,
        error: err instanceof Error ? err.message : String(err),
        type: err?.constructor?.name || 'Error',
      });
      throw err;
    }
  }
}
