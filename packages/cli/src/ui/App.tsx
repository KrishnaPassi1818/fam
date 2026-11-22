import { useState, useEffect, useRef, useCallback } from 'react';
import type { FC } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
  AgentLoop,
  Tracer,
  PromptBuilder,
  ContextManager,
  BackupService,
  MemoryService,
} from '@hx/core';
import type { Message, ModelAdapter, HxConfig, ModelProfile } from '@hx/shared';
import { StatusBar } from './components/StatusBar.js';
import { MessageView } from './components/MessageView.js';
import { ToolCallView } from './components/ToolCallView.js';
import { createAdapter } from './adapter-factory.js';

export interface AppProps {
  config: HxConfig;
  initialModel?: string;
  initialRole?: 'assistant' | 'coder' | 'router';
  localOnly?: boolean;
  systemOverride?: string;
  appendSystem?: string;
  initialPrompt?: string;
  isOneShot?: boolean;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
}

interface ActiveTool {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
  durationMs?: number;
  startTime: number;
}

export const App: FC<AppProps> = ({
  config,
  initialModel,
  initialRole = 'assistant',
  localOnly = false,
  systemOverride,
  appendSystem,
  initialPrompt,
  isOneShot = false,
}) => {
  const { exit } = useApp();

  const [model, setModel] = useState<string>(
    initialModel || config.general.defaultModel || 'llama3.1:8b',
  );
  const [role, setRole] = useState<'assistant' | 'coder' | 'router'>(initialRole);
  const [input, setInput] = useState<string>('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [activeDelta, setActiveDelta] = useState<string>('');
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [usedTokens, setUsedTokens] = useState<number>(0);
  const [tokensPerSec, setTokensPerSec] = useState<number>(0);

  const historyRef = useRef<Message[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const tracerRef = useRef<Tracer>(new Tracer());
  const adapterRef = useRef<ModelAdapter | null>(null);

  // Initialize or update adapter when model changes
  useEffect(() => {
    try {
      adapterRef.current = createAdapter({
        modelId: model,
        config,
        localOnly,
      });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'system',
          content: `Failed to initialize model '${model}': ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    }
  }, [model, config, localOnly]);

  const profile = config.models.models[model] as ModelProfile | undefined;
  const maxCtx = profile?.numCtx || adapterRef.current?.caps.maxCtx || 8192;
  const isLocal = !model.startsWith('gemini') && !model.includes('gemini');
  const tier = (profile as unknown as { tier?: string })?.tier || (model.includes('gemini') ? 'full' : model.includes('1.5b') ? 'min' : 'medium');

  // Submit prompt and run agent turn
  const runAgentTurn = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isProcessing) return;

      const userMsg: DisplayMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        content: userText,
      };
      setMessages((prev) => [...prev, userMsg]);
      historyRef.current.push({ role: 'user', content: userText });

      setIsProcessing(true);
      setActiveDelta('');
      setActiveTools([]);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const adapter = adapterRef.current;
      if (!adapter) {
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            content: `No active model adapter. Switch model via /model <name>`,
          },
        ]);
        setIsProcessing(false);
        return;
      }

      const loop = new AgentLoop({
        adapter,
        tracer: tracerRef.current,
        role,
        tier: tier as 'full' | 'medium' | 'min',
        userGlobalPrompt: systemOverride,
        projectPrompt: appendSystem,
      });

      const startTime = Date.now();
      let chunkCount = 0;
      let finalResponse = '';

      try {
        for await (const event of loop.run(historyRef.current, controller.signal)) {
          if (event.type === 'chunk') {
            chunkCount++;
            finalResponse += event.delta;
            setActiveDelta(finalResponse);

            const elapsedSec = (Date.now() - startTime) / 1000;
            if (elapsedSec > 0.5) {
              setTokensPerSec(chunkCount / elapsedSec);
            }
          } else if (event.type === 'tool_call') {
            const tool = event.toolCall;
            setActiveTools((prev) => [
              ...prev,
              {
                id: tool.id,
                name: tool.name,
                args: tool.args,
                status: 'running',
                startTime: Date.now(),
              },
            ]);
          } else if (event.type === 'tool_result') {
            const res = event.toolResult;
            setActiveTools((prev) =>
              prev.map((t) =>
                t.id === res.callId
                  ? {
                      ...t,
                      status: res.isError ? 'error' : 'completed',
                      result: res.content,
                      durationMs: Date.now() - t.startTime,
                    }
                  : t,
              ),
            );
          } else if (event.type === 'warning') {
            setMessages((prev) => [
              ...prev,
              { id: `w_${Date.now()}`, role: 'system', content: event.message },
            ]);
          } else if (event.type === 'finish') {
            setUsedTokens(event.totalTokens);
            historyRef.current.push({ role: 'assistant', content: event.response });
            setMessages((prev) => [
              ...prev,
              {
                id: `a_${Date.now()}`,
                role: 'assistant',
                content: event.response,
                model,
              },
            ]);
            setActiveDelta('');
          }
        }
      } catch (err) {
        if (controller.signal.aborted) {
          setMessages((prev) => [
            ...prev,
            { id: `sys_${Date.now()}`, role: 'system', content: 'Turn interrupted by user.' },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `err_${Date.now()}`,
              role: 'system',
              content: `Turn error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ]);
        }
        setActiveDelta('');
      } finally {
        setIsProcessing(false);
        abortControllerRef.current = null;
        if (isOneShot) {
          exit();
        }
      }
    },
    [isProcessing, systemOverride, appendSystem, role, tier, model, isOneShot, exit],
  );

  // Handle slash commands
  const handleSlashCommand = async (cmdText: string) => {
    const parts = cmdText.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const arg = parts.slice(1).join(' ');

    switch (cmd) {
      case '/help':
        setMessages((prev) => [
          ...prev,
          {
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
              '  /model <name> - Switch active model (e.g. /model llama3.1:8b)\n' +
              '  /models       - List configured models and placement\n' +
              '  /role <role>  - Set active role (assistant, coder, router)\n' +
              '  /clear        - Clear message history\n' +
              '  /exit         - Terminate session',
          },
        ]);
        break;

      case '/context': {
        const cm = new ContextManager({ modelId: model });
        const pb = new PromptBuilder();
        const res = pb.build({
          modelId: model,
          role,
          tier: tier as 'full' | 'medium' | 'min',
          userGlobalPrompt: systemOverride,
          projectPrompt: appendSystem,
          dynamicContext: { cwd: process.cwd(), date: new Date().toISOString() },
        });
        const acc = cm.account(res.systemPrompt, [], historyRef.current);
        const report =
          `Context Breakdown:\n` +
          `  - System Prompt: ${acc.systemTokens} tokens\n` +
          `  - Tool Defs:     ${acc.toolsTokens} tokens\n` +
          `  - History:       ${acc.historyTokens} tokens (${historyRef.current.length} messages)\n` +
          `  - Work Reserve:  ${acc.budget.reserve} tokens\n` +
          `  - Total Allocated: ${acc.totalTokens + acc.budget.reserve} / ${acc.budget.numCtx} tokens\n` +
          `  - Status: ${acc.exceedsBudget ? 'OVER BUDGET' : 'OK'}`;
        setMessages((prev) => [
          ...prev,
          { id: `ctx_${Date.now()}`, role: 'system', content: report },
        ]);
        break;
      }

      case '/compact': {
        const cm = new ContextManager({ modelId: model });
        const pb = new PromptBuilder();
        const res = pb.build({
          modelId: model,
          role,
          tier: tier as 'full' | 'medium' | 'min',
          userGlobalPrompt: systemOverride,
          projectPrompt: appendSystem,
          dynamicContext: { cwd: process.cwd(), date: new Date().toISOString() },
        });
        const prep = await cm.prepareContext(res.systemPrompt, [], historyRef.current);
        historyRef.current = prep.messages;
        setMessages((prev) => [
          ...prev,
          {
            id: `compact_${Date.now()}`,
            role: 'system',
            content: `Compacted conversation history: ${prep.appliedStrategies.join(', ') || 'already minimal'}. Tokens now: ${prep.accounting.historyTokens}.`,
          },
        ]);
        break;
      }

      case '/undo': {
        const bs = new BackupService();
        try {
          const undoRes = await bs.undo();
          setMessages((prev) => [
            ...prev,
            {
              id: `undo_${Date.now()}`,
              role: 'system',
              content: `Undo successful: restored ${undoRes.restoredCount} file(s), removed ${undoRes.removedCount} newly created file(s).`,
            },
          ]);
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            {
              id: `undo_err_${Date.now()}`,
              role: 'system',
              content: `Undo failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ]);
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
          const content = list.length === 0
            ? 'No stored memories.'
            : 'Stored Memories:\n' + list.map((m) => `- [${m.id}] (${m.kind}, ${m.scope}, ${m.privacy}): ${m.text}`).join('\n');
          setMessages((prev) => [...prev, { id: `mem_${Date.now()}`, role: 'system', content }]);
        } else if (sub === 'search') {
          const results = await mem.retrieve(subArg);
          const content = results.length === 0
            ? `No memories matched "${subArg}".`
            : `Search Results for "${subArg}":\n` + results.map((r) => `- (score: ${r.finalScore.toFixed(3)}) ${r.memory.text}`).join('\n');
          setMessages((prev) => [...prev, { id: `mem_${Date.now()}`, role: 'system', content }]);
        } else if (sub === 'forget') {
          const ok = mem.forget(subArg);
          const content = ok ? `Deleted memory ${subArg}.` : `Memory ${subArg} not found.`;
          setMessages((prev) => [...prev, { id: `mem_${Date.now()}`, role: 'system', content }]);
        } else if (sub === 'export') {
          const json = mem.export();
          setMessages((prev) => [...prev, { id: `mem_${Date.now()}`, role: 'system', content: `Memory Export:\n${json}` }]);
        } else if (sub === 'import') {
          try {
            const count = mem.import(subArg);
            setMessages((prev) => [...prev, { id: `mem_${Date.now()}`, role: 'system', content: `Imported ${count} memories.` }]);
          } catch (err) {
            setMessages((prev) => [...prev, { id: `mem_${Date.now()}`, role: 'system', content: `Import failed: ${err}` }]);
          }
        } else if (sub === 'wipe') {
          mem.wipe();
          setMessages((prev) => [...prev, { id: `mem_${Date.now()}`, role: 'system', content: 'Wiped all memories.' }]);
        }
        break;
      }

      case '/system': {
        const pb = new PromptBuilder();
        const res = pb.build({
          modelId: model,
          role,
          tier: tier as 'full' | 'medium' | 'min',
          userGlobalPrompt: systemOverride,
          projectPrompt: appendSystem,
          dynamicContext: { cwd: process.cwd(), date: new Date().toISOString() },
        });
        const layersSummary = res.layers
          .map((l) => `  - Layer ${l.layer} (${l.name}): ${l.tokens} tok ${l.dropped ? '[DROPPED]' : '[INCLUDED]'}`)
          .join('\n');

        setMessages((prev) => [
          ...prev,
          {
            id: `sys_inspect_${Date.now()}`,
            role: 'system',
            content:
              `System Prompt Inspection:\n` +
              `  Active Model: ${model} (Tier: ${tier})\n` +
              `  Total Tokens: ${res.totalTokens} / Budget: ${res.budget}\n` +
              `  Layers:\n${layersSummary}\n` +
              `  Stable Prefix Chars: ${res.stablePrefix.length}`,
          },
        ]);
        break;
      }

      case '/model':
        if (!arg) {
          setMessages((prev) => [
            ...prev,
            { id: `m_err_${Date.now()}`, role: 'system', content: 'Usage: /model <name>' },
          ]);
        } else {
          setModel(arg);
          setMessages((prev) => [
            ...prev,
            { id: `m_ok_${Date.now()}`, role: 'system', content: `Switched model to '${arg}'` },
          ]);
        }
        break;

      case '/models': {
        const lines = Object.entries(config.models.models).map(
          ([mId, prof]) => {
            const p = prof as ModelProfile;
            return `  - ${mId}: placement=${p.placement}, ctx=${p.numCtx}`;
          },
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `models_list_${Date.now()}`,
            role: 'system',
            content: `Configured Models:\n${lines.join('\n')}`,
          },
        ]);
        break;
      }

      case '/role':
        if (arg === 'assistant' || arg === 'coder' || arg === 'router') {
          setRole(arg);
          setMessages((prev) => [
            ...prev,
            { id: `r_ok_${Date.now()}`, role: 'system', content: `Switched role to '${arg}'` },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { id: `r_err_${Date.now()}`, role: 'system', content: 'Usage: /role <assistant|coder|router>' },
          ]);
        }
        break;

      case '/clear':
        historyRef.current = [];
        setMessages([]);
        setActiveDelta('');
        setActiveTools([]);
        break;

      case '/exit':
        exit();
        break;

      default:
        setMessages((prev) => [
          ...prev,
          {
            id: `cmd_unk_${Date.now()}`,
            role: 'system',
            content: `Unknown command '${cmdText}'. Type /help for available commands.`,
          },
        ]);
        break;
    }
  };

  // Keyboard navigation: Esc to interrupt
  useInput((_inputChar, key) => {
    if (key.escape && isProcessing) {
      abortControllerRef.current?.abort();
    }
  });

  // Handle one-shot initial prompt
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim().length > 0) {
      void runAgentTurn(initialPrompt);
    }
  }, [initialPrompt, runAgentTurn]);

  const handleSubmit = (text: string) => {
    setInput('');
    if (text.startsWith('/')) {
      handleSlashCommand(text);
    } else {
      void runAgentTurn(text);
    }
  };

  return (
    <Box flexDirection="column" padding={1} width="100%">
      {/* Scrollback Messages */}
      {messages.map((m) => (
        <MessageView
          key={m.id}
          role={m.role}
          content={m.content}
          model={m.model}
        />
      ))}

      {/* Active Streaming Response */}
      {activeDelta ? (
        <MessageView
          role="assistant"
          content={activeDelta}
          model={model}
          isStreaming={true}
        />
      ) : null}

      {/* Active Tool Calls */}
      {activeTools.length > 0 && (
        <Box flexDirection="column" marginY={1}>
          {activeTools.map((t) => (
            <ToolCallView
              key={t.id}
              name={t.name}
              args={t.args}
              status={t.status}
              result={t.result}
              durationMs={t.durationMs}
            />
          ))}
        </Box>
      )}

      {/* Prompt Input Box */}
      {!isOneShot && (
        <Box marginTop={1} marginBottom={1}>
          <Text color="cyan" bold>hx &gt; </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            focus={!isProcessing}
            placeholder={isProcessing ? 'Processing... (Press Esc to interrupt)' : 'Ask a question or type /help'}
          />
        </Box>
      )}

      {/* Status Bar */}
      <StatusBar
        model={model}
        usedTokens={usedTokens}
        maxCtx={maxCtx}
        tier={tier}
        isLocal={isLocal}
        cwd={process.cwd()}
        tokensPerSec={tokensPerSec}
      />
    </Box>
  );
};
