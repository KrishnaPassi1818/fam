import { describe, it, expect } from 'vitest';
import { SessionDriver } from '../ui/session.js';
import type { ToTuiMessage } from '../ui/types.js';
import type { ModelAdapter, Message, ChatRequest, ChatChunk } from '@fam/shared';
import { loadConfig } from '@fam/core';

class MockAdapter implements ModelAdapter {
  id = 'mock:test-model';
  caps = {
    tools: true,
    parallelTools: false,
    vision: false,
    jsonSchemaFormat: true,
    maxCtx: 8192,
  };

  public turns: Array<{ chunks: string[]; toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }> }> = [];
  public currentTurn = 0;

  async *chat(_req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk> {
    const turn = this.turns[this.currentTurn] || { chunks: ['Default response'] };
    this.currentTurn++;

    if (turn.toolCalls && turn.toolCalls.length > 0) {
      for (const tc of turn.toolCalls) {
        if (signal?.aborted) return;
        yield { delta: '', toolCalls: [tc] };
      }
      return;
    }

    for (const chunk of turn.chunks) {
      if (signal?.aborted) return;
      yield { delta: chunk };
      // Small tick delay to allow abort testing
      await new Promise((r) => setTimeout(r, 20));
    }

    yield {
      delta: '',
      usage: {
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
      },
    };
  }

  countTokens(msgs: Message[]): number {
    return msgs.length * 10;
  }
}

describe('Agent Loop & TUI Driver Integration', () => {
  const config = loadConfig();

  it('runs multi-step streaming conversation and emits granular TUI events', async () => {
    const emitted: ToTuiMessage[] = [];
    const driver = new SessionDriver({ config, initialModel: 'qwen3.5:4b' }, (msg) => emitted.push(msg));

    const mockAdapter = new MockAdapter();
    mockAdapter.turns = [
      { chunks: ['Hello ', 'world!'] },
    ];
    // Inject mock adapter into driver
    (driver as unknown as { adapter: ModelAdapter }).adapter = mockAdapter;

    await driver.runAgentTurn('Hi there');

    // Verify messages sequence
    const userMsg = emitted.find((m) => m.type === 'message' && m.role === 'user');
    expect(userMsg).toBeDefined();
    expect((userMsg as { content: string }).content).toBe('Hi there');

    const chunks = emitted.filter((m) => m.type === 'chunk');
    expect(chunks.length).toBeGreaterThan(0);
    const text = chunks.map((c) => (c as { delta: string }).delta).join('');
    expect(text).toBe('Hello world!');

    const finish = emitted.find((m) => m.type === 'finish');
    expect(finish).toBeDefined();
    expect((finish as { response: string }).response).toBe('Hello world!');

    const status = emitted.find((m) => m.type === 'status');
    expect(status).toBeDefined();
  });

  it('executes tool calling lifecycle and reports duration and results', async () => {
    const emitted: ToTuiMessage[] = [];
    const driver = new SessionDriver({ config, initialModel: 'qwen3.5:4b' }, (msg) => emitted.push(msg));

    const mockAdapter = new MockAdapter();
    mockAdapter.turns = [
      // Turn 0: emit tool call for built-in echo tool
      {
        chunks: [],
        toolCalls: [{ id: 'call_echo_1', name: 'echo', args: { message: 'Integration test ping' } }],
      },
      // Turn 1: final response
      {
        chunks: ['Tool executed successfully.'],
      },
    ];
    (driver as unknown as { adapter: ModelAdapter }).adapter = mockAdapter;

    await driver.runAgentTurn('Please echo ping');

    // 1. Tool call emitted to TUI
    const toolCall = emitted.find((m) => m.type === 'tool_call');
    expect(toolCall).toBeDefined();
    expect((toolCall as { name: string }).name).toBe('echo');

    // 2. Tool result emitted to TUI
    const toolResult = emitted.find((m) => m.type === 'tool_result');
    expect(toolResult).toBeDefined();
    expect((toolResult as { call_id: string }).call_id).toBe('call_echo_1');
    expect((toolResult as { is_error: boolean }).is_error).toBe(false);

    // 3. Final finish emitted
    const finish = emitted.find((m) => m.type === 'finish');
    expect(finish).toBeDefined();
    expect((finish as { response: string }).response).toBe('Tool executed successfully.');
  });

  it('aborts active streaming turn on interrupt message', async () => {
    const emitted: ToTuiMessage[] = [];
    const driver = new SessionDriver({ config, initialModel: 'qwen3.5:4b' }, (msg) => emitted.push(msg));

    const mockAdapter = new MockAdapter();
    mockAdapter.turns = [
      { chunks: ['Chunk 1', 'Chunk 2', 'Chunk 3', 'Chunk 4', 'Chunk 5'] },
    ];
    (driver as unknown as { adapter: ModelAdapter }).adapter = mockAdapter;

    // Start turn in background
    const turnPromise = driver.runAgentTurn('Long request');

    // Send interrupt shortly after start
    setTimeout(() => {
      void driver.handleFromTuiMessage({ type: 'interrupt' });
    }, 25);

    await turnPromise;

    // Verify turn interrupted message emitted
    const interruptedMsg = emitted.find(
      (m) => m.type === 'message' && m.role === 'system' && m.content.includes('Turn interrupted by user'),
    );
    expect(interruptedMsg).toBeDefined();
  });
});
