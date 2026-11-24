import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../loop/index.js';
import type { ModelAdapter, ChatRequest, ChatChunk, Message } from '@fam/shared';

describe('AgentLoop', () => {
  it('completes direct conversation turn without tool calls', async () => {
    const fakeAdapter: ModelAdapter = {
      id: 'mock:model',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(): AsyncIterable<ChatChunk> {
        yield { delta: 'Hello ' };
        yield { delta: 'there!' };
      },
      countTokens: () => 10,
    };

    const loop = new AgentLoop({ adapter: fakeAdapter });
    const events = [];
    for await (const ev of loop.run([{ role: 'user', content: 'Hi' }])) {
      events.push(ev);
    }

    expect(events.filter((e) => e.type === 'chunk')).toHaveLength(2);
    const finish = events.find((e) => e.type === 'finish');
    expect(finish).toBeDefined();
    if (finish?.type === 'finish') {
      expect(finish.response).toBe('Hello there!');
      expect(finish.steps).toBe(1);
    }
  });

  it('handles tool call round-trip using built-in echo tool', async () => {
    let turn = 0;
    const fakeAdapter: ModelAdapter = {
      id: 'mock:model',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
        turn++;
        if (turn === 1) {
          yield {
            delta: 'Invoking echo...',
            toolCalls: [{ id: 'call_1', name: 'echo', args: { message: 'fam test' } }],
          };
        } else {
          // Verify that tool result was included in messages
          const toolMsg = req.messages.find((m) => m.role === 'tool') as Extract<Message, { role: 'tool' }> | undefined;
          expect(toolMsg).toBeDefined();
          expect(toolMsg?.content).toBe('fam test');
          yield { delta: 'Echo verified: fam test' };
        }
      },
      countTokens: () => 15,
    };

    const loop = new AgentLoop({ adapter: fakeAdapter });
    const events = [];
    for await (const ev of loop.run([{ role: 'user', content: 'test echo' }])) {
      events.push(ev);
    }

    const toolCallEv = events.find((e) => e.type === 'tool_call');
    expect(toolCallEv).toBeDefined();

    const toolResultEv = events.find((e) => e.type === 'tool_result');
    expect(toolResultEv).toBeDefined();
    if (toolResultEv?.type === 'tool_result') {
      expect(toolResultEv.toolResult.content).toBe('fam test');
    }

    const finish = events.find((e) => e.type === 'finish');
    expect(finish).toBeDefined();
    if (finish?.type === 'finish') {
      expect(finish.steps).toBe(2);
      expect(finish.response).toBe('Echo verified: fam test');
    }
  });

  it('detects loop repetitions and throws LoopDetected', async () => {
    const fakeAdapter: ModelAdapter = {
      id: 'mock:model',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(): AsyncIterable<ChatChunk> {
        yield {
          delta: 'calling tool again',
          toolCalls: [{ id: 'call_loop', name: 'echo', args: { message: 'stuck' } }],
        };
      },
      countTokens: () => 10,
    };

    const loop = new AgentLoop({
      adapter: fakeAdapter,
      repetitionThreshold: 3,
    });

    const run = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of loop.run([{ role: 'user', content: 'loop test' }])) {
        // iterate
      }
    };

    await expect(run()).rejects.toThrow(/Repetition loop detected: echo/);
  });

  it('guards against maxSteps limit', async () => {
    let callIdx = 0;
    const fakeAdapter: ModelAdapter = {
      id: 'mock:model',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(): AsyncIterable<ChatChunk> {
        callIdx++;
        yield {
          delta: 'calling distinct tool',
          toolCalls: [{ id: `call_${callIdx}`, name: 'echo', args: { message: `step_${callIdx}` } }],
        };
      },
      countTokens: () => 10,
    };

    const loop = new AgentLoop({
      adapter: fakeAdapter,
      maxSteps: 3,
    });

    const run = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of loop.run([{ role: 'user', content: 'step limit' }])) {
        // iterate
      }
    };

    await expect(run()).rejects.toThrow(/budget exceeded: 3/i);
  });

  it('aborts execution when AbortSignal is aborted', async () => {
    const controller = new AbortController();

    const fakeAdapter: ModelAdapter = {
      id: 'mock:model',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(): AsyncIterable<ChatChunk> {
        controller.abort();
        yield { delta: 'start' };
      },
      countTokens: () => 10,
    };

    const loop = new AgentLoop({ adapter: fakeAdapter });

    const run = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of loop.run([{ role: 'user', content: 'abort test' }], controller.signal)) {
        // iterate
      }
    };

    await expect(run()).rejects.toThrow(/abort signal/);
  });
});
