import type { Message, ModelAdapter, ModelProfile, ToolDescriptor } from '@fam/shared';
import {
  AgentLoop,
  Tracer,
  PromptBuilder,
  ContextManager,
  BackupService,
  MemoryService,
  type ToolExecutionHandler,
} from '@fam/core';
import { McpHost } from '@fam/mcp-host';
import { createAdapter } from './adapter-factory.js';
import type { FromTuiMessage, ToTuiMessage, TuiSessionConfig } from './types.js';

export class SessionDriver {
  private config: TuiSessionConfig['config'];
  private model: string;
  private role: 'assistant' | 'coder' | 'router';
  private localOnly: boolean;
  private systemOverride?: string;
  private appendSystem?: string;
  private isOneShot: boolean;

  private adapter: ModelAdapter | null = null;
  private history: Message[] = [];
  private tracer = new Tracer();
  private abortController: AbortController | null = null;
  private isProcessing = false;
  private usedTokens = 0;
  private sendToTui: (msg: ToTuiMessage) => void;
  private onExit?: () => void;

  private mcpHost: McpHost | null = null;
  private tools: ToolDescriptor[] = [];
  private toolHandlers: Record<string, ToolExecutionHandler> = {};
  private mcpInitPromise: Promise<void> | null = null;

  constructor(
    options: TuiSessionConfig,
    sendToTui: (msg: ToTuiMessage) => void,
    onExit?: () => void,
  ) {
    this.config = options.config;
    this.model = options.initialModel || options.config.general.defaultModel || 'qwen3.5:4b';
    this.role = options.initialRole || 'assistant';
    this.localOnly = options.localOnly || false;
    this.systemOverride = options.systemOverride;
    this.appendSystem = options.appendSystem;
    this.isOneShot = options.isOneShot || false;
    this.sendToTui = sendToTui;
    this.onExit = onExit;

    this.initAdapter();
  }

  public init(): void {
    const profile = (this.config.models.models[this.model] ||
      this.config.models.models[`ollama:${this.model}`] ||
      this.config.models.models[this.model.replace(/^ollama:/, '')]) as ModelProfile | undefined;
    const maxCtx = profile?.numCtx || this.adapter?.caps.maxCtx || 4096;
    const isLocal = !this.model.startsWith('gemini') && !this.model.includes('gemini');
    const tier = this.getTier();

    void this.initMcp();

    this.sendToTui({
      type: 'init',
      model: this.model,
      max_ctx: maxCtx,
      tier,
      is_local: isLocal,
      cwd: process.cwd(),
      role: this.role,
    });
  }

  public async initMcp(): Promise<void> {
    if (this.mcpInitPromise) return this.mcpInitPromise;
    this.mcpInitPromise = (async () => {
      try {
        if (!this.config.servers?.servers) return;
        this.mcpHost = new McpHost({
          servers: this.config.servers.servers,
        });
        await this.mcpHost.initAutoStartServers();
        this.tools = await this.mcpHost.getTools(true);
        this.toolHandlers = await this.mcpHost.getToolHandlers();
      } catch (err) {
        this.sendToTui({
          type: 'warning',
          message: `MCP initialization warning: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    })();
    return this.mcpInitPromise;
  }

  private initAdapter(): void {
    try {
      this.adapter = createAdapter({
        modelId: this.model,
        config: this.config,
        localOnly: this.localOnly,
      });
    } catch (err) {
      this.sendToTui({
        type: 'error',
        message: `Failed to initialize model '${this.model}': ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  public getTier(): string {
    const profile = (this.config.models.models[this.model] ||
      this.config.models.models[`ollama:${this.model}`] ||
      this.config.models.models[this.model.replace(/^ollama:/, '')]) as ModelProfile | undefined;
    return (
      (profile as unknown as { tier?: string })?.tier ||
      (this.model.includes('gemini') ? 'full' : this.model.includes('1.5b') ? 'min' : 'medium')
    );
  }

  public async handleFromTuiMessage(msg: FromTuiMessage): Promise<void> {
    switch (msg.type) {
      case 'user_input':
        if (msg.text.startsWith('/')) {
          await this.handleSlashCommand(msg.text);
        } else {
          await this.runAgentTurn(msg.text);
        }
        break;

      case 'interrupt':
        if (this.isProcessing && this.abortController) {
          this.abortController.abort();
        }
        break;

      case 'approval_decision':
        // When tool approvals are handled asynchronously by loop/executor
        break;

      case 'exit':
        this.exit();
        break;
    }
  }

  public async runAgentTurn(userText: string): Promise<void> {
    if (!userText.trim() || this.isProcessing) return;

    this.isProcessing = true;
    this.history.push({ role: 'user', content: userText });
    this.sendToTui({
      type: 'message',
      id: `u_${Date.now()}`,
      role: 'user',
      content: userText,
    });

    const controller = new AbortController();
    this.abortController = controller;

    if (!this.adapter) {
      this.sendToTui({
        type: 'error',
        message: `No active model adapter. Switch model via /model <name>`,
      });
      this.isProcessing = false;
      return;
    }

    await this.initMcp();

    const tier = this.getTier() as 'full' | 'medium' | 'min';
    const memoryService = new MemoryService();
    const loop = new AgentLoop({
      adapter: this.adapter,
      tracer: this.tracer,
      memoryService,
      role: this.role,
      tier,
      userGlobalPrompt: this.systemOverride,
      projectPrompt: this.appendSystem,
      tools: this.tools,
      toolHandlers: this.toolHandlers,
    });

    const startTime = Date.now();
    let chunkCount = 0;

    try {
      for await (const event of loop.run(this.history, controller.signal)) {
        if (event.type === 'chunk') {
          chunkCount++;
          const elapsedSec = (Date.now() - startTime) / 1000;
          const tokensPerSec = elapsedSec > 0.5 ? chunkCount / elapsedSec : undefined;

          this.sendToTui({
            type: 'chunk',
            delta: event.delta,
            tokens_per_sec: tokensPerSec,
          });
        } else if (event.type === 'tool_call') {
          const tool = event.toolCall;
          this.sendToTui({
            type: 'tool_call',
            id: tool.id,
            name: tool.name,
            args: (tool.args as Record<string, unknown>) || {},
          });
        } else if (event.type === 'tool_result') {
          const res = event.toolResult;
          this.sendToTui({
            type: 'tool_result',
            call_id: res.callId,
            is_error: Boolean(res.isError),
            content: res.content,
            duration_ms: Date.now() - startTime,
          });
        } else if (event.type === 'warning') {
          this.sendToTui({
            type: 'warning',
            message: event.message,
          });
        } else if (event.type === 'state_change') {
          this.sendToTui({
            type: 'warning',
            message: `[State: ${event.state}] ${event.detail || ''}`,
          });
        } else if (event.type === 'plan') {
          this.sendToTui({
            type: 'warning',
            message: `[Plan: ${event.plan.steps.length} steps for ${event.plan.task_id}]`,
          });
        } else if (event.type === 'finish') {
          this.usedTokens = event.totalTokens;
          this.history.push({ role: 'assistant', content: event.response });
          this.sendToTui({
            type: 'finish',
            response: event.response,
            total_tokens: event.totalTokens,
          });

          this.sendToTui({
            type: 'status',
            used_tokens: event.totalTokens,
            model: this.model,
            tier,
            is_local: !this.model.startsWith('gemini'),
            cwd: process.cwd(),
          });
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        this.sendToTui({
          type: 'message',
          id: `sys_${Date.now()}`,
          role: 'system',
          content: 'Turn interrupted by user.',
        });
      } else {
        this.sendToTui({
          type: 'error',
          message: `Turn error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      if (this.isOneShot) {
        this.exit();
      }
    }
  }

  public async handleSlashCommand(cmdText: string): Promise<void> {
    const parts = cmdText.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const arg = parts.slice(1).join(' ');

    switch (cmd) {
      case '/help':
        this.sendToTui({
          type: 'message',
          id: `help_${Date.now()}`,
          role: 'system',
          content:
            'Slash Commands:\n' +
            '  /help         - Show this help message\n' +
            '  /context      - Component token breakdown and budget\n' +
            '  /compact      - Compress conversation history to fit budget\n' +
            '  /undo         - Restore last pre-write change set\n' +
            '  /memory       - List/search/forget long-term memory\n' +
            '  /system       - Inspect active system prompt and layers\n' +
            '  /model <name> - Switch active model (e.g. /model qwen3.5:4b)\n' +
            '  /models       - List configured models and placement\n' +
            '  /role <role>  - Set active role (assistant, coder, router)\n' +
            '  /clear        - Clear message history\n' +
            '  /exit         - Terminate session',
        });
        break;

      case '/context': {
        const cm = new ContextManager({ modelId: this.model });
        const pb = new PromptBuilder();
        const res = pb.build({
          modelId: this.model,
          role: this.role,
          tier: this.getTier() as 'full' | 'medium' | 'min',
          userGlobalPrompt: this.systemOverride,
          projectPrompt: this.appendSystem,
          dynamicContext: { cwd: process.cwd(), date: new Date().toISOString() },
        });
        const acc = cm.account(res.systemPrompt, [], this.history);
        const report =
          `Context Breakdown:\n` +
          `  - System Prompt: ${acc.systemTokens} tokens\n` +
          `  - Tool Defs:     ${acc.toolsTokens} tokens\n` +
          `  - History:       ${acc.historyTokens} tokens (${this.history.length} messages)\n` +
          `  - Work Reserve:  ${acc.budget.reserve} tokens\n` +
          `  - Total Allocated: ${acc.totalTokens + acc.budget.reserve} / ${acc.budget.numCtx} tokens\n` +
          `  - Status: ${acc.exceedsBudget ? 'OVER BUDGET' : 'OK'}`;
        this.sendToTui({
          type: 'message',
          id: `ctx_${Date.now()}`,
          role: 'system',
          content: report,
        });
        break;
      }

      case '/compact': {
        const cm = new ContextManager({ modelId: this.model });
        const pb = new PromptBuilder();
        const res = pb.build({
          modelId: this.model,
          role: this.role,
          tier: this.getTier() as 'full' | 'medium' | 'min',
          userGlobalPrompt: this.systemOverride,
          projectPrompt: this.appendSystem,
          dynamicContext: { cwd: process.cwd(), date: new Date().toISOString() },
        });
        const prep = await cm.prepareContext(res.systemPrompt, [], this.history);
        this.history = prep.messages;
        this.sendToTui({
          type: 'message',
          id: `compact_${Date.now()}`,
          role: 'system',
          content: `Compacted conversation history: ${prep.appliedStrategies.join(', ') || 'already minimal'}. Tokens now: ${prep.accounting.historyTokens}.`,
        });
        break;
      }

      case '/undo': {
        const bs = new BackupService();
        try {
          const undoRes = await bs.undo();
          this.sendToTui({
            type: 'message',
            id: `undo_${Date.now()}`,
            role: 'system',
            content: `Undo successful: restored ${undoRes.restoredCount} file(s), removed ${undoRes.removedCount} newly created file(s).`,
          });
        } catch (err) {
          this.sendToTui({
            type: 'message',
            id: `undo_err_${Date.now()}`,
            role: 'system',
            content: `Undo failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        break;
      }

      case '/memory': {
        const mem = new MemoryService();
        const subParts = arg.split(/\s+/);
        const sub = subParts[0]?.toLowerCase();
        const subArg = subParts.slice(1).join(' ');

        if (sub === 'list' || !sub) {
          const list = mem.list();
          const content =
            list.length === 0
              ? 'No stored memories.'
              : 'Stored Memories:\n' +
                list
                  .map((m) => `- [${m.id}] (${m.kind}, ${m.scope}, ${m.privacy}): ${m.text}`)
                  .join('\n');
          this.sendToTui({
            type: 'message',
            id: `mem_${Date.now()}`,
            role: 'system',
            content,
          });
        } else if (sub === 'search') {
          const results = await mem.retrieve(subArg);
          const content =
            results.length === 0
              ? `No memories matched "${subArg}".`
              : `Search Results for "${subArg}":\n` +
                results.map((r) => `- (score: ${r.finalScore.toFixed(3)}) ${r.memory.text}`).join('\n');
          this.sendToTui({
            type: 'message',
            id: `mem_${Date.now()}`,
            role: 'system',
            content,
          });
        } else if (sub === 'forget') {
          const ok = mem.forget(subArg);
          const content = ok ? `Deleted memory ${subArg}.` : `Memory ${subArg} not found.`;
          this.sendToTui({
            type: 'message',
            id: `mem_${Date.now()}`,
            role: 'system',
            content,
          });
        } else if (sub === 'wipe') {
          mem.wipe();
          this.sendToTui({
            type: 'message',
            id: `mem_${Date.now()}`,
            role: 'system',
            content: 'Wiped all memories.',
          });
        }
        break;
      }

      case '/system': {
        const pb = new PromptBuilder();
        const res = pb.build({
          modelId: this.model,
          role: this.role,
          tier: this.getTier() as 'full' | 'medium' | 'min',
          userGlobalPrompt: this.systemOverride,
          projectPrompt: this.appendSystem,
          dynamicContext: { cwd: process.cwd(), date: new Date().toISOString() },
        });
        const layersSummary = res.layers
          .map(
            (l) =>
              `  - Layer ${l.layer} (${l.name}): ${l.tokens} tok ${l.dropped ? '[DROPPED]' : '[INCLUDED]'}`,
          )
          .join('\n');

        this.sendToTui({
          type: 'message',
          id: `sys_inspect_${Date.now()}`,
          role: 'system',
          content:
            `System Prompt Inspection:\n` +
            `  Active Model: ${this.model} (Tier: ${this.getTier()})\n` +
            `  Total Tokens: ${res.totalTokens} / Budget: ${res.budget}\n` +
            `  Layers:\n${layersSummary}\n` +
            `  Stable Prefix Chars: ${res.stablePrefix.length}`,
        });
        break;
      }

      case '/model':
        if (!arg) {
          this.sendToTui({
            type: 'message',
            id: `m_err_${Date.now()}`,
            role: 'system',
            content: 'Usage: /model <name>',
          });
        } else {
          this.model = arg;
          this.initAdapter();
          this.sendToTui({
            type: 'message',
            id: `m_ok_${Date.now()}`,
            role: 'system',
            content: `Switched model to '${arg}'`,
          });
          this.sendToTui({
            type: 'status',
            used_tokens: this.usedTokens,
            model: this.model,
            tier: this.getTier(),
            is_local: !this.model.startsWith('gemini'),
          });
        }
        break;

      case '/models': {
        const lines = Object.entries(this.config.models.models).map(([mId, prof]) => {
          const p = prof as ModelProfile;
          return `  - ${mId}: placement=${p.placement}, ctx=${p.numCtx}`;
        });
        this.sendToTui({
          type: 'message',
          id: `models_list_${Date.now()}`,
          role: 'system',
          content: `Configured Models:\n${lines.join('\n')}`,
        });
        break;
      }

      case '/role':
        if (arg === 'assistant' || arg === 'coder' || arg === 'router') {
          this.role = arg;
          this.sendToTui({
            type: 'message',
            id: `r_ok_${Date.now()}`,
            role: 'system',
            content: `Switched role to '${arg}'`,
          });
        } else {
          this.sendToTui({
            type: 'message',
            id: `r_err_${Date.now()}`,
            role: 'system',
            content: 'Usage: /role <assistant|coder|router>',
          });
        }
        break;

      case '/clear':
        this.history = [];
        this.sendToTui({ type: 'clear' });
        break;

      case '/exit':
        this.exit();
        break;

      default:
        this.sendToTui({
          type: 'message',
          id: `cmd_unk_${Date.now()}`,
          role: 'system',
          content: `Unknown command '${cmdText}'. Type /help for available commands.`,
        });
        break;
    }
  }

  public exit(): void {
    if (this.mcpHost) {
      void this.mcpHost.shutdown();
    }
    this.sendToTui({ type: 'exit' });
    if (this.onExit) {
      this.onExit();
    }
  }

  // Getters for testing
  public getModel(): string {
    return this.model;
  }
  public getRole(): string {
    return this.role;
  }
  public getHistory(): Message[] {
    return this.history;
  }
}
